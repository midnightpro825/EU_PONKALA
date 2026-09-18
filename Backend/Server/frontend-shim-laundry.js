<!-- ============================================================ -->
<!-- ENGINE LAUNDRY SHIM (F1) — auto-injected                    -->
<!-- Wires student laundry page to /api/engine/laundry/*          -->
<!-- ============================================================ -->
<script>
(function(){
  'use strict';
  if (window.__engineLaundryF1) return;
  window.__engineLaundryF1 = true;

  var API = '/api/engine/laundry';
  var user = null;
  try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch(e) {}
  var userId = user && (user.user_id || user.id);
  if (!userId) { console.warn('[F1-laundry] no user, skipping'); return; }

  var catalog = [];
  var cart = {};
  var access = null;

  function api(path, opts) {
    return fetch(API + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts || {})).then(function(r){ return r.json(); });
  }

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html) e.innerHTML = html;
    return e;
  }

  // ---- Sticky banner ----
  function renderBanner() {
    var b = document.getElementById('engineLaundryBanner');
    if (!b) {
      b = el('div', 'position:sticky;top:0;z-index:9999;background:linear-gradient(135deg,#f5a623,#d4951f);color:#fff;padding:12px 16px;font-weight:700;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:Inter,sans-serif;font-size:14px;');
      b.id = 'engineLaundryBanner';
      document.body.insertBefore(b, document.body.firstChild);
    }

    if (!access) { b.innerHTML = '<span>Loading laundry status...</span>'; return; }

    if (!access.unlocked || access.remaining <= 0) {
      b.innerHTML = '<span>Laundry locked - unlock with K50 (4 connections)</span>' +
        '<button id="engineUnlockBtn" style="padding:8px 16px;border:none;border-radius:8px;background:#fff;color:#f5a623;font-weight:800;cursor:pointer;font-size:13px;">Unlock K50</button>';
      var btn = document.getElementById('engineUnlockBtn');
      if (btn) btn.onclick = unlock;
    } else {
      b.innerHTML = '<span>Laundry Unlocked - <b>' + access.remaining + '</b> connection' +
        (access.remaining === 1 ? '' : 's') + ' remaining</span>' +
        '<span style="opacity:0.85;font-size:12px;">held: ' + access.held + ' | used: ' + access.used + '</span>';
    }
  }

  // ---- Unlock ----
  function unlock() {
    if (!confirm('Unlock Laundry for K50?\nYou get 4 laundry connections.')) return;
    return api('/access/unlock', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, reference: 'WEB-F1-' + Date.now() })
    }).then(function(res){
      if (res.status === 'success') {
        access = res.data;
        renderBanner();
        alert('Laundry Unlocked - ' + access.remaining + ' connections remaining.');
      } else {
        alert('Unlock failed: ' + res.message);
      }
    }).catch(function(e){ alert('Unlock error: ' + e.message); });
  }

  // ---- Catalog ----
  function loadCatalog() {
    return api('/catalog').then(function(res){
      if (res.status === 'success') {
        catalog = res.data;
        console.log('[F1-laundry] catalog loaded:', catalog.length, 'items');
        injectCatalogHelper();
      }
    });
  }

  // ---- Injects a floating cart helper that appears bottom-right ----
  function injectCatalogHelper() {
    if (document.getElementById('engineLaundryPanel')) return;

    var panel = el('div', 'position:fixed;right:20px;bottom:20px;z-index:9998;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.2);padding:18px;min-width:280px;max-width:360px;font-family:Inter,sans-serif;');
    panel.id = 'engineLaundryPanel';

    var items = catalog.map(function(c){
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f2f5;font-size:13px;">' +
             '<span>' + c.item_label + ' <span style="color:#f5a623;font-weight:700;">K' + c.unit_price + '</span></span>' +
             '<span><button data-add="' + c.item_code + '" style="width:24px;height:24px;border:none;border-radius:6px;background:#f5a623;color:#fff;font-weight:900;cursor:pointer;">+</button>' +
             '<span id="q-' + c.item_code + '" style="display:inline-block;width:24px;text-align:center;font-weight:700;">0</span>' +
             '<button data-sub="' + c.item_code + '" style="width:24px;height:24px;border:none;border-radius:6px;background:#e5e7eb;color:#374151;font-weight:900;cursor:pointer;">-</button></span></div>';
    }).join('');

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<b style="font-size:14px;">Order Laundry</b>' +
        '<button id="enginePanelClose" style="border:none;background:none;cursor:pointer;font-size:18px;color:#9ca3af;">&times;</button>' +
      '</div>' +
      '<div style="max-height:220px;overflow-y:auto;">' + items + '</div>' +
      '<div style="margin-top:10px;padding-top:10px;border-top:2px solid #f5a623;display:flex;justify-content:space-between;align-items:center;">' +
        '<b style="font-size:15px;">Total: K<span id="engineCartTotal">0</span></b>' +
        '<button id="enginePlaceOrder" style="padding:8px 14px;border:none;border-radius:8px;background:#f5a623;color:#fff;font-weight:800;cursor:pointer;font-size:13px;">Place order</button>' +
      '</div>';

    document.body.appendChild(panel);

    panel.addEventListener('click', function(ev){
      var t = ev.target;
      if (t.dataset && t.dataset.add) {
        cart[t.dataset.add] = (cart[t.dataset.add] || 0) + 1;
        refreshCartUI();
      }
      if (t.dataset && t.dataset.sub) {
        cart[t.dataset.sub] = Math.max(0, (cart[t.dataset.sub] || 0) - 1);
        refreshCartUI();
      }
      if (t.id === 'enginePanelClose') panel.style.display = 'none';
      if (t.id === 'enginePlaceOrder') placeOrder();
    });
  }

  function refreshCartUI() {
    Object.keys(cart).forEach(function(code){
      var q = document.getElementById('q-' + code);
      if (q) q.textContent = cart[code];
    });
    getPrice().then(function(p){ 
      var t = document.getElementById('engineCartTotal');
      if (t) t.textContent = p.total;
    });
  }

  function buildCart() {
    var items = [];
    Object.keys(cart).forEach(function(k){ if (cart[k] > 0) items.push({ item_code: k, quantity: cart[k] }); });
    return items;
  }

  function getPrice() {
    var items = buildCart();
    if (!items.length) return Promise.resolve({ total: 0, lines: [] });
    return api('/price', { method:'POST', body: JSON.stringify({ items: items }) })
      .then(function(res){ return res.status === 'success' ? res.data : { total: 0, lines: [] }; });
  }

  // ---- Place order ----
  function placeOrder() {
    var items = buildCart();
    if (!items.length) { alert('Add at least one item.'); return; }
    if (!access || access.remaining <= 0) { alert('Unlock laundry first (K50).'); return; }

    var zoneEl = document.querySelector('#pickupZone, select[name="pickup_zone_id"], select[id*="zone"]');
    var landmarkEl = document.querySelector('#pickupLandmark, select[name="pickup_landmark_id"], select[id*="landmark"]');
    var zoneId = zoneEl ? Number(zoneEl.value) : 1;
    var lmId = landmarkEl ? Number(landmarkEl.value) : null;

    api('/order', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId, items: items,
        pickup_zone_id: zoneId, pickup_landmark_id: lmId,
        instructions: 'Web order (F1)'
      })
    }).then(function(res){
      if (res.status === 'success') {
        alert('Order placed: ' + res.data.order_code + '\nTotal: K' + res.data.price + '\n\nWe will match you with a provider.');
        access = res.data.access;
        cart = {};
        renderBanner();
        location.reload();
      } else {
        alert('Order failed: ' + res.message);
      }
    }).catch(function(e){ alert('Order error: ' + e.message); });
  }

  // ---- Load access ----
  function loadAccess() {
    return api('/access/' + userId).then(function(res){
      if (res.status === 'success') { access = res.data; renderBanner(); }
    });
  }

  // ---- Boot ----
  Promise.all([loadCatalog(), loadAccess()]).catch(function(e){
    console.warn('[F1-laundry] boot error:', e);
  });

  window.__engineF1Laundry = {
    get catalog(){ return catalog; },
    get access(){ return access; },
    unlock: unlock, placeOrder: placeOrder, getPrice: getPrice
  };
})();
</script>
<!-- END ENGINE LAUNDRY SHIM (F1) -->