/* dc-lite: runs a page's component (class Component extends DCLogic) against HTML that
   tools/build.cjs already rendered. The build marks the live parts of the page:
     data-b="attr:expr;attr:expr"   attributes kept in step with the component's values
     data-t="expr"                  text kept in step
     data-if="expr"                 <dc-if> shown or hidden; <template> filled in the first time it turns true
     data-on-click|submit|change="name"   event handlers from renderVals()
   The same helpers (styleStr, resolve) are used by the build, so the first render matches. */
(function () {
  'use strict';

  var UNITLESS = /^(opacity|zIndex|fontWeight|lineHeight|flex|flexGrow|flexShrink|order|zoom|gridRow|gridColumn|gridRowStart|gridRowEnd|gridColumnStart|gridColumnEnd|columnCount|orphans|widows|tabSize|fillOpacity|strokeOpacity|aspectRatio|animationIterationCount|scale)$/;
  var BOOL = /^(disabled|checked|hidden|required|readonly|selected|open|muted|autoplay|loop|controls|playsinline)$/;

  function styleStr(v) {
    if (v == null || v === false) return '';
    if (typeof v === 'string') return v;
    var out = [];
    for (var k in v) {
      var x = v[k];
      if (x == null || x === '' || typeof x === 'boolean') continue;
      var p = k.indexOf('--') === 0 ? k : k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
      if (/^(ms|webkit|moz)-/.test(p)) p = '-' + p;
      out.push(p + ':' + (typeof x === 'number' && x !== 0 && !UNITLESS.test(k) ? x + 'px' : x));
    }
    return out.join(';');
  }

  // Expressions: a name or dotted path, a literal, !expr, or a === / !== b.
  function resolve(vals, src) {
    var e = String(src).trim();
    if (!e) return undefined;
    var m = e.match(/^(.+?)\s*(===|!==)\s*(.+)$/);
    if (m) {
      var a = resolve(vals, m[1]), b = resolve(vals, m[3]);
      return m[2] === '===' ? a === b : a !== b;
    }
    if (e[0] === '!') return !resolve(vals, e.slice(1));
    if (e === 'true') return true;
    if (e === 'false') return false;
    if (e === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
    if (/^'.*'$/.test(e) || /^".*"$/.test(e)) return e.slice(1, -1);
    var cur = vals;
    var parts = e.split('.');
    for (var i = 0; i < parts.length; i++) cur = cur == null ? undefined : cur[parts[i]];
    return cur;
  }

  function textOf(v) { return v == null || typeof v === 'boolean' ? '' : String(v); }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { styleStr: styleStr, resolve: resolve, textOf: textOf, BOOL: BOOL };
  }
  if (typeof document === 'undefined') return;

  var inst = null, vals = {}, pending = false, afterRender = [];

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (update, cb) {
    var patch = typeof update === 'function' ? update(this.state, this.props) : update;
    if (cb) afterRender.push(cb);
    if (patch) {
      var same = true;
      for (var k in patch) if (patch[k] !== this.state[k]) { same = false; break; }
      if (same && !cb) return;
      this.state = Object.assign({}, this.state, patch);
    }
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };

  function schedule() {
    if (pending) return;
    pending = true;
    Promise.resolve().then(function () { pending = false; render(); });
  }

  function setAttr(el, name, v) {
    if (name === 'style') {
      var s = styleStr(v);
      if (el.__dcStyle !== s) { el.__dcStyle = s; el.style.cssText = s; }
    } else if (name === 'value') {
      var t = textOf(v);
      if (el.value !== t) el.value = t;
    } else if (BOOL.test(name)) {
      el[name] = !!v;
    } else if (v == null || v === false) {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, String(v));
    }
  }

  function render() {
    vals = inst.renderVals() || {};
    var i, els;
    els = document.querySelectorAll('[data-if]');
    for (i = 0; i < els.length; i++) {
      var el = els[i], on = !!resolve(vals, el.getAttribute('data-if'));
      if (el.tagName === 'TEMPLATE') {
        if (!on) continue;
        var box = document.createElement('dc-if');
        box.setAttribute('data-if', el.getAttribute('data-if'));
        box.appendChild(el.content.cloneNode(true));
        el.parentNode.replaceChild(box, el);
      } else if (el.hidden === on) {
        el.hidden = !on;
      }
    }
    els = document.querySelectorAll('[data-b]');
    for (i = 0; i < els.length; i++) {
      var specs = els[i].getAttribute('data-b').split(';');
      for (var j = 0; j < specs.length; j++) {
        var c = specs[j].indexOf(':');
        setAttr(els[i], specs[j].slice(0, c), resolve(vals, specs[j].slice(c + 1)));
      }
    }
    els = document.querySelectorAll('[data-t]');
    for (i = 0; i < els.length; i++) {
      var txt = textOf(resolve(vals, els[i].getAttribute('data-t')));
      if (els[i].textContent !== txt) els[i].textContent = txt;
    }
    var cbs = afterRender; afterRender = [];
    cbs.forEach(function (f) { f(); });
  }

  // Handlers bubble from the target up, as React's do; stopPropagation() ends the walk.
  function dispatch(type, ev) {
    for (var el = ev.target; el && el !== document; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      var name = el.getAttribute('data-on-' + type);
      if (name && typeof vals[name] === 'function') vals[name](ev);
      if (ev.cancelBubble) break;
    }
  }
  function isTextField(t) { return t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !/^(checkbox|radio|file)$/.test(t.type)); }
  document.addEventListener('click', function (e) { dispatch('click', e); });
  document.addEventListener('submit', function (e) { dispatch('submit', e); });
  // React's onChange fires on every keystroke for text fields and on change for the rest.
  document.addEventListener('input', function (e) { if (isTextField(e.target)) dispatch('change', e); });
  document.addEventListener('change', function (e) { if (!isTextField(e.target)) dispatch('change', e); });

  function mount() {
    var s = document.getElementById('dc-logic');
    if (!s) return;
    var props = JSON.parse(s.getAttribute('data-props') || '{}');
    var Component = new Function('DCLogic', s.textContent + '\n;return Component;')(DCLogic);
    inst = new Component(props);
    render();
    if (inst.componentDidMount) inst.componentDidMount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
