// Font stylesheet loader — external so index.html needs no inline event
// handler (the CSP's script-src without 'unsafe-inline' blocks onload=
// attributes). Replaces the old media="print" + onload swap trick: the
// stylesheet is preloaded in <head>, then applied here before first paint.
(function () {
  var HREF =
    'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap';
  try {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = HREF;
    document.head.appendChild(link);
  } catch {
    // Non-DOM or blocked storage env — Inter falls back to system-ui.
  }
})();
