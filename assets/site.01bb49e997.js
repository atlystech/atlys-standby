/* site.js: shared by every page.
   - Remembers where a visitor came from (utm_*, gclid, li_fat_id, referrer) for 30 days, first and latest touch,
     so the contact form can include it in the enquiry email.
   - Conversion helpers (the tags themselves are written into each page's <head> by the build from
     site.config.json, and are skipped when an ID is empty or the visitor opted out on /privacy):
       atlysTrack.demo(where)   LinkedIn demo conversion + GA4 demo_click + Google Ads demo label, once per click
       atlysTrack.event(name, params)   a GA4 event (no personal data)
       atlysTrack.leadSent()    marks a real send, then /thanks fires generate_lead + the Google Ads lead label once
     LinkedIn counts leads from the /thanks page load itself, so no LinkedIn call is made for the form.
   - Clicks on [data-track="demo"] call atlysTrack.demo(data-track-where); [data-track="event"] sends data-track-name.
   - Clicks on any email or phone link send contact_click (method email or phone, and the page), so those count too.
   - The opt-out button on /privacy ([data-optout]). The footer links to /privacy. */
(function () {
  'use strict';
  var KEY = 'atlys_src', DAYS30 = 30 * 24 * 3600 * 1000;
  var cfg = window.ATLYS_CFG || {};

  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* private mode */ } }

  // ----- where the visitor came from -----
  var FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'li_fat_id'];
  function readStore() {
    var s = null;
    try { s = JSON.parse(get(KEY) || 'null'); } catch (e) { s = null; }
    var now = Date.now();
    if (s && s.first && now - s.first.ts > DAYS30) s.first = null;
    if (s && s.last && now - s.last.ts > DAYS30) s.last = null;
    return s && (s.first || s.last) ? s : { first: null, last: null };
  }
  (function capture() {
    var q = new URLSearchParams(location.search), touch = null;
    FIELDS.forEach(function (f) { var v = q.get(f); if (v) { touch = touch || {}; touch[f] = v.slice(0, 200); } });
    var ref = '';
    try { ref = document.referrer && new URL(document.referrer).hostname !== location.hostname ? new URL(document.referrer).hostname : ''; } catch (e) { ref = ''; }
    if (!touch && ref) touch = { referrer: ref };
    if (!touch) return;
    touch.landing = location.pathname;
    touch.ts = Date.now();
    var s = readStore();
    if (!s.first) s.first = touch;
    s.last = touch;
    set(KEY, JSON.stringify(s));
  })();
  function describe(t) {
    if (!t) return '';
    var parts = [];
    FIELDS.concat(['referrer']).forEach(function (f) { if (t[f]) parts.push(f + '=' + t[f]); });
    parts.push('landing=' + t.landing, 'date=' + new Date(t.ts).toISOString().slice(0, 10));
    return parts.join(', ');
  }
  // Fields added to every enquiry: the latest touch as separate fields, both touches as text.
  window.atlysSource = function () {
    var s = readStore(), t = s.last || {}, out = {};
    FIELDS.forEach(function (f) { out[f] = t[f] || ''; });
    out.first_touch = describe(s.first) || 'direct';
    out.latest_touch = describe(s.last) || 'direct';
    out.page = location.pathname;
    return out;
  };

  // Sends an enquiry through Web3Forms to admin@atlystech.com.au, with where the visitor came from.
  // fields: { Name, Company, Email, Phone, Service, ERP, Message }. Resolves true when it was accepted.
  window.atlysSend = function (fields) {
    var now = new Date().toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    var src = window.atlysSource();
    var body = {
      access_key: cfg.form,
      subject: (fields.Service === 'Atlys Joey demo' ? 'Joey demo request' : 'Website query') + ' : ' + now,
      from_name: 'atlys Website',
      replyto: fields.Email,
      cc: 'admin@atlystech.com.au'
    };
    Object.keys(fields).forEach(function (k) { body[k] = fields[k]; });
    body['Came from (latest)'] = src.latest_touch;
    body['Came from (first)'] = src.first_touch;
    body['Sent from page'] = src.page;
    FIELDS.forEach(function (f) { if (src[f]) body[f] = src[f]; });
    return fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) { return !!(d && d.success); });
  };

  // ----- events and conversions -----
  function gtagOk() { return typeof window.gtag === 'function'; }
  var track = {
    event: function (name, params) { if (gtagOk()) window.gtag('event', name, params || {}); },
    demo: function (where) {
      if (window.lintrk && cfg.liDemo) window.lintrk('track', { conversion_id: Number(cfg.liDemo) });
      track.event('demo_click', { where: where || '' });
      if (gtagOk() && cfg.ads && cfg.adsDemo) window.gtag('event', 'conversion', { send_to: cfg.ads + '/' + cfg.adsDemo });
    },
    leadSent: function () { try { window.sessionStorage.setItem('atlys_lead', '1'); } catch (e) { /* ignore */ } },
  };
  window.atlysTrack = track;

  // /thanks: count the lead once, only after a real send.
  if (location.pathname.replace(/\/$/, '') === '/thanks') {
    var sent = null;
    try { sent = window.sessionStorage.getItem('atlys_lead'); window.sessionStorage.removeItem('atlys_lead'); } catch (e) { sent = null; }
    if (sent) {
      track.event('generate_lead', {});
      if (gtagOk() && cfg.ads && cfg.adsLead) window.gtag('event', 'conversion', { send_to: cfg.ads + '/' + cfg.adsLead });
    }
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href^="mailto:"], a[href^="tel:"]');
    if (link) track.event('contact_click', { method: link.protocol === 'tel:' ? 'phone' : 'email', page: location.pathname });
    var el = e.target.closest && e.target.closest('[data-track]');
    if (!el) return;
    var kind = el.getAttribute('data-track');
    if (kind === 'demo') track.demo(el.getAttribute('data-track-where'));
    else if (kind === 'event') track.event(el.getAttribute('data-track-name'), { where: el.getAttribute('data-track-where') || '' });
  });

  // ----- opt-out -----
  function onReady(f) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', f); else f(); }
  onReady(function () {
    var opt = document.querySelector('[data-optout]');
    if (opt) {
      var status = document.querySelector('[data-optout-status]');
      var show = function () {
        var off = get('atlys_optout') === '1';
        opt.textContent = off ? 'Turn tracking back on' : 'Turn off tracking in this browser';
        if (status) status.textContent = off ? 'Tracking is off in this browser.' : 'Tracking is on in this browser.';
      };
      opt.addEventListener('click', function () {
        if (get('atlys_optout') === '1') del('atlys_optout');
        else { set('atlys_optout', '1'); del(KEY); }
        show();
      });
      show();
    }
  });
})();
