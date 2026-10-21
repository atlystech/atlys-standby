// The full user guide is for reading on screen only: no printing, saving, copying or right-click menu.
// It only puts casual copying off (a screenshot or the page source still shows it); nothing secret is on the page.
(function () {
  var stop = function (e) { e.preventDefault(); };
  document.addEventListener('contextmenu', stop);
  document.addEventListener('copy', stop);
  document.addEventListener('cut', stop);
  document.addEventListener('dragstart', stop);
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's' || k === 'c' || k === 'a' || k === 'u')) e.preventDefault();
  });
  window.addEventListener('beforeprint', function () { document.documentElement.classList.add('no-print'); });
})();
