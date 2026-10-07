/**
 * Influzer install embed — drop on any docs page:
 *   <div data-influzer-install="playwright"></div>
 *   <script async src="https://www.influzer.ai/embed/install.js"></script>
 */
(function () {
  var ORIGIN = 'https://www.influzer.ai';
  var nodes = document.querySelectorAll('[data-influzer-install]');
  if (!nodes.length) return;

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }
    if (text) node.textContent = text;
    return node;
  }

  function render(root, data) {
    root.innerHTML = '';
    root.style.cssText =
      'font-family:ui-sans-serif,system-ui,sans-serif;border:1px solid #e4e4e7;border-radius:12px;padding:16px 18px;background:#fff;color:#18181b;max-width:640px;';

    var title = el('div', null, 'Connect ' + data.name + ' (MCP)');
    title.style.cssText = 'font-weight:700;font-size:16px;margin:0 0 6px;';
    root.appendChild(title);

    var q = data.quality || {};
    var meta = el(
      'div',
      null,
      (q.demoware_tier_label || 'Listing') +
        ' · ' +
        (q.live_status_label || 'Not probed') +
        ' · not a SAFE badge',
    );
    meta.style.cssText = 'font-size:12px;color:#71717a;margin:0 0 12px;';
    root.appendChild(meta);

    var tabs = el('div');
    tabs.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;';
    var pre = el('pre');
    pre.style.cssText =
      'margin:0;padding:12px;background:#18181b;color:#ececec;border-radius:8px;overflow:auto;font-size:12px;line-height:1.45;white-space:pre-wrap;';
    var order = ['cursor', 'claude-code', 'claude', 'chatgpt', 'acp'];
    var active = order.find(function (id) {
      return data.clients[id] && data.clients[id].available && data.clients[id].code;
    }) || 'cursor';

    function show(id) {
      active = id;
      var client = data.clients[id];
      pre.textContent = (client && client.code) || (client && client.summary) || '';
      Array.prototype.forEach.call(tabs.children, function (btn) {
        var on = btn.getAttribute('data-id') === id;
        btn.style.background = on ? '#18181b' : '#f4f4f5';
        btn.style.color = on ? '#fff' : '#18181b';
      });
    }

    order.forEach(function (id) {
      var client = data.clients[id];
      if (!client) return;
      var btn = el('button', { type: 'button', 'data-id': id }, client.label);
      btn.style.cssText =
        'border:0;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;';
      btn.addEventListener('click', function () {
        show(id);
      });
      tabs.appendChild(btn);
    });

    root.appendChild(tabs);
    root.appendChild(pre);

    var link = el('a', { href: data.page_url }, 'Open on Influzer →');
    link.style.cssText = 'display:inline-block;margin-top:10px;font-size:13px;font-weight:600;color:#4f46e5;text-decoration:none;';
    root.appendChild(link);

    show(active);
  }

  Array.prototype.forEach.call(nodes, function (root) {
    var slug = root.getAttribute('data-influzer-install');
    if (!slug) return;
    fetch(ORIGIN + '/api/v1/install/' + encodeURIComponent(slug), {
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          root.textContent = 'Influzer listing not found.';
          return;
        }
        render(root, data);
      })
      .catch(function () {
        root.textContent = 'Could not load Influzer install snippets.';
      });
  });
})();
