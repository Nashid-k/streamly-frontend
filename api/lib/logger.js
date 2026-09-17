// api/lib/logger.js — tiny structured request logger for Vercel serverless
// functions. Vercel captures function stdout/stderr per invocation free on
// Hobby, so a line per request turns the dashboard into a usable signal
// (5xx bursts, slow cold-starts, /api/tmdb edge-hit vs function-hit rate).
// Logs never contain credentials: URLs are the handler's own request path.

export function withLog(handler) {
  return function loggedHandler(req, res, ...rest) {
    const start = Date.now();
    // res in the Vercel runtime is a real http.ServerResponse; guard so the
    // helper also works with the minimal mock `res` used in unit tests.
    if (typeof res?.on === 'function') {
      res.on('finish', () => {
        const ms = Date.now() - start;
        const line = `[Streamly][api] ${req.method || '?'} ${req.url || '/'} -> ${res.statusCode} (${ms}ms)`;
        if (res.statusCode >= 500) console.error(line);
        else if (res.statusCode >= 400) console.warn(line);
        else console.log(line);
      });
    }
    return handler(req, res, ...rest);
  };
}