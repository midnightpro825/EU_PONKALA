<!-- ============================================================ -->
<!-- ENGINE WHEELBARROW SHIM (F1) — auto-injected                -->
<!-- Wires student wheelbarrow page to /api/engine/wheelbarrow/*  -->
<!-- ============================================================ -->
<script>
(function(){
  'use strict';
  if (window.__engineWheelbarrowF1) return;
  window.__engineWheelbarrowF1 = true;

  var API = '/api/engine/wheelbarrow';
  var user = null;
  try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch(e) {}
  var userId = user && (user.user_id || user.id);
  if (!userId) { console.warn('[F1-wb] no user, skipping'); return; }

  var zones = [];
  var landmarks = [];
  var lastQuote = null;

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

  // ---- Load zones for the picker ----
  function loadZones() {
    return fetch('/api/engine/zones').then(function(r){ return r.json(); }).then(function(res){
      if (res.status === 'success') zones = res.data;
    });
  }

  // ---- Compute quote (live) ----
  function computeQuote() {
    var pu = document.getElementById('wbPickupZone');
    var de = document.getElementById('wbDestZone');
    var ls = document.getElementById('wbLoadSize');
    var wc = document.getElementById('wbCount');
    if (!pu || !de || !ls || !wc) return;

    var body = {
      pickup_zone_id: Number(pu.value),
      destination_zone_id: Number(de.value),
      load_size: ls.value,
      wheelbarrow_count: Number(wc.value)
    };

    api('/quote', { method:'POST', body: JSON.stringify(body) }).then(function(res){
      if (res.status === 'success') {
        lastQuote = res.data;
        var out = document.getElementById('wbQuoteOut');
        if (out) {
          out.innerHTML = 'Quote: <b style="font-size:18px;color:#f5a623;">K' + res.data.total + '</b>' +
            '<div style="font-size:11px;color:#6b7280;margin-top:4px;">base K' + res.data.breakdown.base_price +
            ' + distance K' + res.data.breakdown.distance_charge +
            ' + wheelbarrows K' + res.data.breakdown.wheelbarrow_charge +
            ' (load x' + res.data.breakdown.load_multiplier + ')</div>';
        }
      }
    }).catch(function(e){ console.warn('[F1-wb] quote error', e); });
  }

  // ---- Inject the order panel ----
  function injectPanel() {
    if (document.getElementById('engineWbPanel')) return;

    var zoneOptions = zones.map(function(z){
      return '<option value="' + z.zone_id + '">' + z.zone_code + ' — ' + z.zone_name + '</option>';
    }).join('');

    var panel = el('div', 'position:fixed;right:20px;bottom:20px;z-index:9998;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.2);padding:18px;min-width:300px;max-width:380px;font-family:Inter,sans-serif;');
    panel.id = 'engineWbPanel';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<b style="font-size:14px;">Request Transport</b>' +
        '<button id="wbClose" style="border:none;background:none;cursor:pointer;font-size:18px;color:#9ca3af;">&times;</button>' +
      '</div>' +
      '<label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px;">Pickup zone</label>' +
      '<select id="wbPickupZone" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:8px;">' + zoneOptions + '</select>' +
      '<label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px;">Destination zone</label>' +
      '<select id="wbDestZone" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:8px;">' + zoneOptions + '</select>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<div style="flex:1;"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px;">Load size</label>' +
        '<select id="wbLoadSize" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;">' +
          '<option value="SMALL">Small</option><option value="MEDIUM" selected>Medium</option><option value="LARGE">Large</option>' +
        '</select></div>' +
        '<div style="width:100px;"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px;">Count</label>' +
        '<input id="wbCount" type="number" min="1" value="1" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;"></div>' +
      '</div>' +
      '<div id="wbQuoteOut" style="padding:10px;background:#fef3c7;border-radius:8px;margin-bottom:10px;font-size:13px;color:#78350f;">Quote: waiting...</div>' +
      '<button id="wbRequest" style="width:100%;padding:12px;border:none;border-radius:10px;background:#f5a623;color:#fff;font-weight:800;cursor:pointer;font-size:14px;">Request Transport</button>';

    document.body.appendChild(panel);

    // Wire live quote
    ['wbPickupZone','wbDestZone','wbLoadSize','wbCount'].forEach(function(id){
      var e = document.getElementById(id);
      if (e) e.addEventListener('change', computeQuote);
      if (e) e.addEventListener('input', computeQuote);
    });

    document.getElementById('wbClose').onclick = function(){ panel.style.display = 'none'; };
    document.getElementById('wbRequest').onclick = requestOrder;

    // Initial quote
    computeQuote();
  }

  // ---- Request transport order ----
  function requestOrder() {
    if (!lastQuote) { alert('Please wait, calculating quote...'); return; }
    if (!confirm('Request transport for K' + lastQuote.total + '?')) return;

    var pu = document.getElementById('wbPickupZone').value;
    var de = document.getElementById('wbDestZone').value;
    var ls = document.getElementById('wbLoadSize').value;
    var wc = document.getElementById('wbCount').value;

    api('/order', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        pickup_zone_id: Number(pu),
        destination_zone_id: Number(de),
        load_size: ls,
        wheelbarrow_count: Number(wc),
        instructions: 'Web order (F1)'
      })
    }).then(function(res){
      if (res.status === 'success') {
        alert('Order placed: ' + res.data.order_code + '\nTotal: K' + res.data.price);
        location.reload();
      } else {
        alert('Order failed: ' + res.message);
      }
    }).catch(function(e){ alert('Order error: ' + e.message); });
  }

  // ---- Boot ----
  loadZones().then(function(){
    setTimeout(injectPanel, 500);
  }).catch(function(e){ console.warn('[F1-wb] boot error', e); });

  window.__engineF1Wheelbarrow = { computeQuote: computeQuote };
})();
</script>
<!-- END ENGINE WHEELBARROW SHIM (F1) -->