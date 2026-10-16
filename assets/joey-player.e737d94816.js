/* "Which Joey are you?" player on /joey.
   The tiles are plain HTML in the page (so their text is crawlable). A released tile is a <button> with
   data-role, data-question-id, data-video (720p) and data-video-hd (1080p); a locked one has data-locked.
   Clicking a released tile grows it into the video player; at the end the grid comes back with the tile
   ticked, the count updated and "Who's next?". Progress is kept in this browser (localStorage atlys_joey).
   GA4 events (no personal data): role_selected, player_start, question_asked, player_complete, player_cta_click. */
(function () {
  'use strict';
  var root = document.querySelector('[data-joey-player]');
  if (!root) return;
  var stage = root.querySelector('.jp-stage');
  var grid = root.querySelector('.jp-grid');
  var box = root.querySelector('.jp-player');
  var video = box.querySelector('video');
  var closeBtn = box.querySelector('.jp-close');
  var after = root.querySelector('.jp-after');
  var tiles = Array.prototype.slice.call(root.querySelectorAll('.jp-tile')); // release order, kept for "Who's next?"
  // A fresh order on every visit, so each role gets its turn at the top.
  (function shuffle() {
    var list = Array.prototype.slice.call(grid.children);
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
    list.forEach(function (el) { grid.appendChild(el); });
  })();
  var total = tiles.length;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = null, started = false;

  function track(name, params) { if (window.atlysTrack) window.atlysTrack.event(name, params); }
  function load() { try { return JSON.parse(localStorage.getItem('atlys_joey') || '{}').done || []; } catch (e) { return []; } }
  function save(done) { try { localStorage.setItem('atlys_joey', JSON.stringify({ done: done })); } catch (e) { /* private mode */ } }

  function paint() {
    var done = load();
    tiles.forEach(function (t) { t.classList.toggle('is-done', done.indexOf(t.getAttribute('data-role')) >= 0); });
    var n = tiles.filter(function (t) { return t.classList.contains('is-done'); }).length;
    root.querySelectorAll('[data-jp-count]').forEach(function (el) { el.textContent = n + '/' + total + ' completed'; });
  }

  // The player sits over the stage; it starts at the tile's rectangle and grows to full width.
  function tileTransform(tile) {
    var s = stage.getBoundingClientRect(), t = tile.getBoundingClientRect();
    var w = s.width, h = w * 9 / 16;
    return 'translate(' + (t.left - s.left) + 'px,' + (t.top - s.top) + 'px) scale(' + (t.width / w) + ',' + (t.height / h) + ')';
  }

  function open(tile) {
    current = tile; started = false;
    var role = tile.getAttribute('data-role');
    track('role_selected', { role: role });
    var hd = (window.screen.width * (window.devicePixelRatio || 1) > 1500) && !(navigator.connection && navigator.connection.saveData);
    var src = (hd && tile.getAttribute('data-video-hd')) || tile.getAttribute('data-video');
    if (video.getAttribute('src') !== src) video.setAttribute('src', src);
    video.setAttribute('poster', tile.getAttribute('data-poster') || '');
    video.setAttribute('aria-label', tile.getAttribute('data-title') || 'Atlys Joey episode');
    after.hidden = true;
    stage.style.minHeight = (stage.getBoundingClientRect().width * 9 / 16) + 'px';
    box.hidden = false;
    box.style.transition = 'none';
    box.style.transform = reduce ? 'none' : tileTransform(tile);
    box.style.opacity = reduce ? '1' : '0.4';
    root.classList.add('is-playing');
    void box.offsetWidth; // apply the start position before animating
    box.style.transition = reduce ? 'none' : 'transform .55s cubic-bezier(.2,.7,.2,1), opacity .3s ease';
    box.style.transform = 'none';
    box.style.opacity = '1';
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* the visitor can press play */ });
    setTimeout(function () {
      var r = box.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight) box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      closeBtn.focus({ preventScroll: true });
    }, reduce ? 0 : 560);
  }

  function close(completed) {
    if (!current) return;
    var tile = current;
    video.pause();
    if (completed) {
      var done = load(), role = tile.getAttribute('data-role');
      if (done.indexOf(role) < 0) { done.push(role); save(done); }
    }
    root.classList.remove('is-playing');
    var finish = function () {
      box.hidden = true;
      box.style.transform = '';
      stage.style.minHeight = '';
      paint();
      if (completed) showNext(tile);
      tile.focus({ preventScroll: true });
      current = null;
    };
    if (reduce) { finish(); return; }
    box.style.transform = tileTransform(tile);
    box.style.opacity = '0';
    setTimeout(finish, 480);
  }

  function showNext(tile) {
    var role = tile.getAttribute('data-role');
    var left = tiles.filter(function (t) { return !t.classList.contains('is-done'); });
    var ready = left.filter(function (t) { return !t.hasAttribute('data-locked'); })[0];
    var el = after.querySelector('[data-jp-next]');
    // never name an unreleased episode: the release order is not announced
    if (ready) {
      el.textContent = ready.getAttribute('data-name') + ' Joey is ready when you are.';
    } else if (left.length) {
      el.textContent = 'A new episode every week. Follow Atlys Tech on LinkedIn to catch the next one.';
    } else {
      el.textContent = 'You have seen every Joey released so far.';
    }
    after.querySelector('[data-jp-done]').textContent = tile.getAttribute('data-name') + ' completed.';
    after.hidden = false;
    after.setAttribute('data-role', role);
  }

  tiles.forEach(function (t) {
    if (t.hasAttribute('data-locked')) return;
    t.addEventListener('click', function () { open(t); });
  });
  closeBtn.addEventListener('click', function () { close(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) close(false); });
  video.addEventListener('play', function () {
    if (!current || started) return;
    started = true;
    var role = current.getAttribute('data-role');
    track('player_start', { role: role });
    track('question_asked', { role: role, question_id: current.getAttribute('data-question-id') });
  });
  video.addEventListener('ended', function () {
    if (!current) return;
    track('player_complete', { role: current.getAttribute('data-role') });
    close(true);
  });
  // The closing call to action counts as a demo click (LinkedIn, GA4 and Google Ads), then goes to the form.
  root.querySelectorAll('[data-jp-cta]').forEach(function (a) {
    a.addEventListener('click', function () {
      track('player_cta_click', { where: a.getAttribute('data-jp-cta') });
      if (window.atlysTrack) window.atlysTrack.demo('joey-player');
    });
  });
  root.querySelectorAll('[data-jp-again]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = tiles.filter(function (x) { return x.getAttribute('data-role') === after.getAttribute('data-role'); })[0];
      if (t) open(t);
    });
  });
  paint();
})();
