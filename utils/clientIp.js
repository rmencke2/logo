'use strict';

const net = require('net');

function stripMapped(ip) {
  const raw = String(ip || '').trim().replace(/^\[|\]$/g, '');
  const dotted = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  return raw;
}

function isLoopback(ip) {
  const value = stripMapped(ip).toLowerCase();
  return value === '127.0.0.1' || value === '::1';
}

function isValidIp(ip) {
  return net.isIP(stripMapped(ip)) !== 0;
}

/**
 * Address of the browser, not a value the browser invented.
 *
 * Nginx connects from loopback and sets X-Real-IP to $remote_addr. The
 * left-most X-Forwarded-For entry is client-supplied because nginx appends
 * with $proxy_add_x_forwarded_for, so it is ignored. A connection that does
 * not come from the local proxy uses the socket address only.
 */
function getClientIp(req) {
  const socketIp = stripMapped(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');
  if (isLoopback(socketIp)) {
    const real = stripMapped(req?.headers?.['x-real-ip']);
    if (isValidIp(real) && !isLoopback(real)) return real;
    const viaExpress = stripMapped(req?.ip);
    if (isValidIp(viaExpress) && !isLoopback(viaExpress)) return viaExpress;
  }
  if (isValidIp(socketIp)) return socketIp;
  return 'unknown';
}

module.exports = {
  getClientIp,
  stripMapped,
};
