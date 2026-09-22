// Streamly boot helpers (external so index.html can drop script-src
// 'unsafe-inline' from the CSP — inline scripts were the only reason it was
// needed in the first place).

// Block native context menu everywhere except when React has already handled it
// (moved here from an inline index.html script for CSP compliance).
document.addEventListener('contextmenu', function (event) {
  if (!event.defaultPrevented) {
    event.preventDefault();
  }
});

/* Selective SW revalidation on new deploy: clear only caches bound to a
   PREVIOUS app version (keeps SW registered + image/trailer caches warm so
   the next request revalidates via SWR instead of re-downloading everything). */
(function () {
  var V = 'v19.6';
  var prev = null;
  try { prev = localStorage.getItem('_sv'); } catch (nothing) {}
  if (prev !== V) {
    try {
      localStorage.setItem('_sv', V);
      var tasks = [];
      if ('caches' in window) {
        tasks.push(
          caches.keys().then(function (names) {
            // Nuke every SW-managed cache (they are all named `streamly-*`)
            // on a version bump; the freshly-registered SW re-creates
            // streamly-v19.6 / streamly-images-v19.6 on first activation.
            var stale = names.filter(function (k) { return k.indexOf('streamly') === 0; });
            return Promise.all(stale.map(function (k) { return caches.delete(k); }));
          })
        );
      }
      if ('serviceWorker' in navigator) {
        tasks.push(
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.update(); }));
          })
        );
      }
      Promise.all(tasks).then(function () { window.location.reload(); });
    } catch (nothing) {}
  }
})();

// Block native context menu everywhere except when React has already handled it.
document.addEventListener('contextmenu', function (event) {
  if (!event.defaultPrevented) {
    event.preventDefault();
  }
});
