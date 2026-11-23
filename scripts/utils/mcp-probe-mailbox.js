'use strict';

/**
 * Read verification mail for the Influzer probe mailbox.
 *
 * IMAP login uses MCP_PROBE_GMAIL_APP_PASSWORD. A normal Gmail password is
 * rejected by Google for this. The password is sent only to the IMAP host
 * and is never included in errors, logs, or HTTP responses.
 */

const tls = require('tls');

const PROBE_PASSWORD_ENV = 'MCP_PROBE_GMAIL_APP_PASSWORD';
const DEFAULT_IMAP_HOST = 'imap.gmail.com';
const DEFAULT_IMAP_PORT = 993;

function probeMailboxStatus(env = process.env) {
  const email = String(env.MCP_PROBE_ACCOUNT_EMAIL || '').trim().toLowerCase();
  const password = String(env[PROBE_PASSWORD_ENV] || '');
  return {
    configured: Boolean(email && password),
    email: email || null,
    imapHost: env.MCP_PROBE_IMAP_HOST || DEFAULT_IMAP_HOST,
  };
}

function imapQuote(value) {
  const text = String(value || '');
  if (/[\r\n\0]/.test(text)) {
    throw new Error('Probe mailbox credential contains a line break.');
  }
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function imapDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const when = date instanceof Date ? date : new Date();
  return `${when.getUTCDate()}-${months[when.getUTCMonth()]}-${when.getUTCFullYear()}`;
}

function extractHttpsLinks(text) {
  const found = [];
  const re = /https:\/\/[^\s<>"')\]]+/gi;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const cleaned = match[0].replace(/[.,;:!?]+$/g, '');
    try {
      const url = new URL(cleaned);
      if (url.protocol === 'https:') found.push(url.href);
    } catch {
      /* skip malformed */
    }
  }
  return [...new Set(found)];
}

function preferVerificationLink(links, hosts) {
  const allowed = links.filter((href) => {
    if (!hosts || !hosts.size) return true;
    try {
      return hosts.has(new URL(href).host);
    } catch {
      return false;
    }
  });
  const ranked = allowed.find((href) => /verify|confirm|activate|magic|signup|token|email/i.test(href));
  return ranked || allowed[0] || null;
}

function attachBuffer(socket) {
  let buf = Buffer.alloc(0);
  let waiter = null;
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    pump();
  });
  socket.on('error', (err) => {
    if (!waiter) return;
    const reject = waiter.reject;
    waiter = null;
    reject(err);
  });

  function pump() {
    if (!waiter) return;
    const found = waiter.test(buf);
    if (!found) return;
    buf = buf.subarray(found.consumed);
    const { resolve } = waiter;
    waiter = null;
    resolve(found.value);
  }

  return {
    send(line) {
      socket.write(line);
    },
    wait(test, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (waiter) waiter = null;
          reject(new Error('IMAP timeout'));
        }, timeoutMs);
        waiter = {
          test,
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        };
        pump();
      });
    },
  };
}

function consumeTagged(buffer, tag) {
  let i = 0;
  const parts = [];
  const tagRe = new RegExp(`^${tag} (OK|NO|BAD)\\b`, 'i');
  while (i < buffer.length) {
    const nl = buffer.indexOf(0x0a, i);
    if (nl < 0) return null;
    const line = buffer.subarray(i, nl + 1).toString('utf8');
    const literal = line.match(/\{(\d+)\}\r?\n$/);
    if (literal) {
      const size = Number(literal[1]);
      const start = nl + 1;
      if (buffer.length < start + size) return null;
      parts.push(line);
      parts.push(buffer.subarray(start, start + size).toString('utf8'));
      i = start + size;
      continue;
    }
    parts.push(line);
    i = nl + 1;
    if (tagRe.test(line.trim())) {
      return {
        consumed: i,
        status: line.trim().split(/\s+/)[1].toUpperCase(),
        text: parts.join(''),
      };
    }
  }
  return null;
}

function connectTls(host, port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    const fail = (err) => {
      socket.destroy();
      reject(err);
    };
    socket.once('secureConnect', () => {
      socket.off('error', fail);
      resolve(socket);
    });
    socket.once('error', fail);
  });
}

async function imapCommand(session, tag, command, timeoutMs) {
  session.send(`${tag} ${command}\r\n`);
  return session.wait((buffer) => {
    const found = consumeTagged(buffer, tag);
    if (!found) return null;
    return { consumed: found.consumed, value: found };
  }, timeoutMs);
}

async function readProbeInbox({
  email,
  password,
  since,
  hosts,
  socket,
  timeoutMs = 12000,
  imapHost,
  imapPort,
} = {}) {
  const user = String(email || '').trim();
  const secret = String(password || '');
  if (!user || !secret) {
    throw new Error('Probe mailbox is not configured.');
  }
  const ownSocket = !socket;
  const sock = socket || await connectTls(
    imapHost || process.env.MCP_PROBE_IMAP_HOST || DEFAULT_IMAP_HOST,
    Number(imapPort || process.env.MCP_PROBE_IMAP_PORT || DEFAULT_IMAP_PORT),
  );
  const session = attachBuffer(sock);
  try {
    await session.wait((buffer) => {
      const nl = buffer.indexOf(0x0a);
      if (nl < 0) return null;
      const line = buffer.subarray(0, nl + 1).toString('utf8');
      if (!/^\* (OK|PREAUTH)\b/i.test(line)) return null;
      return { consumed: nl + 1, value: line };
    }, timeoutMs);

    const login = await imapCommand(
      session,
      'A1',
      `LOGIN ${imapQuote(user)} ${imapQuote(secret)}`,
      timeoutMs,
    );
    if (login.status !== 'OK') {
      throw new Error('Probe mailbox login failed. Use a Google App Password in MCP_PROBE_GMAIL_APP_PASSWORD.');
    }

    const selected = await imapCommand(session, 'A2', 'SELECT INBOX', timeoutMs);
    if (selected.status !== 'OK') {
      throw new Error('Probe mailbox could not open the inbox.');
    }

    const search = await imapCommand(
      session,
      'A3',
      `UID SEARCH SINCE ${imapDate(since || new Date())}`,
      timeoutMs,
    );
    const ids = [];
    const searchLine = search.text.match(/\*\s+SEARCH\s+([0-9\s]*)/i);
    if (searchLine) {
      for (const id of searchLine[1].trim().split(/\s+/)) {
        if (/^\d+$/.test(id)) ids.push(id);
      }
    }
    const recent = ids.slice(-3).reverse();
    const links = [];
    let seq = 4;
    for (const uid of recent) {
      const fetched = await imapCommand(
        session,
        `A${seq}`,
        `UID FETCH ${uid} BODY.PEEK[TEXT]<0.20000>`,
        timeoutMs,
      );
      seq += 1;
      links.push(...extractHttpsLinks(fetched.text));
    }
    try {
      await imapCommand(session, `A${seq}`, 'LOGOUT', Math.min(timeoutMs, 3000));
    } catch {
      /* the links are already in hand */
    }
    return { links: [...new Set(links)], link: preferVerificationLink(links, hosts) };
  } finally {
    if (ownSocket) sock.end();
  }
}

module.exports = {
  PROBE_PASSWORD_ENV,
  probeMailboxStatus,
  imapQuote,
  imapDate,
  extractHttpsLinks,
  preferVerificationLink,
  readProbeInbox,
  consumeTagged,
};
