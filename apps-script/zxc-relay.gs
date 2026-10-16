/**
 * zxc-relay.gs — Google Apps Script relay for Streamly's native ZXC playback.
 *
 * WHY THIS EXISTS
 *   The provider (zxcstream.cc) sits behind a WAF that 502s every /backend*
 *   request coming from datacenter IPs. Our Vercel function egresses from AWS,
 *   so it is refused; a residential or Google IP is allowed. This web app runs
 *   on Google's egress and forwards the handful of small TEXT requests the
 *   resolver needs (title metadata, the token mint, and the manifest). Video
 *   bytes never pass through here — the final CDN allows CORS "*", so the
 *   browser fetches segments directly.
 *
 * DEPLOY (once, ~2 minutes)
 *   1. https://script.google.com  ->  New project.
 *   2. Delete the stub, paste this whole file into Code.gs.
 *   3. Change SECRET below to a random string (e.g. from
 *      https://www.uuidgenerator.net  — or just mash the keyboard).
 *   4. Deploy -> New deployment -> type "Web app".
 *        - Description: streamly zxc relay
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Deploy, authorise the requested permissions (it only makes outbound
 *      web requests — that is the whole script).
 *   5. Copy the Web app URL (https://script.google.com/macros/s/AKfy.../exec).
 *   6. On Vercel -> Project -> Settings -> Environment Variables, add:
 *        ZXC_RELAY_URL = <that URL>?token=<your SECRET>
 *      (and set VITE_ZXC_NATIVE=true — see .env.example).
 *   7. Redeploy the Vercel project so the function picks up the variable.
 *
 * CONTRACT (server -> relay, JSON POST; relay -> server, JSON body)
 *   request  { url, method, headers, body }
 *   response { status, contentType, body }   // body is always text
 *   GET on the /exec URL with ?ping=1 returns { ok: true } for a health check.
 */

var SECRET = "CHANGE_ME_TO_A_RANDOM_STRING";

// The relay only talks to the playback provider — a leaked URL can never turn
// it into a general-purpose open proxy.
var ALLOWED_HOSTS = ["zxcstream.cc", "vidstuck.cc", "vidstuck.xyz"];

// Headers Apps Script refuses to set (or that its own fetch must own). Our
// server already filters these, but guard here too.
var BLOCKED_HEADERS = {
  host: true,
  "content-length": true,
  connection: true,
  "accept-encoding": true,
};

function hostAllowed(host) {
  host = String(host || "").toLowerCase();
  for (var i = 0; i < ALLOWED_HOSTS.length; i++) {
    var allowed = ALLOWED_HOSTS[i];
    if (host === allowed || host.slice(-(allowed.length + 1)) === "." + allowed) return true;
  }
  return false;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet(e) {
  if (e && e.parameter && e.parameter.token !== SECRET) {
    return jsonOutput({ ok: false, error: "unauthorized" });
  }
  if (e && e.parameter && e.parameter.ping) {
    return jsonOutput({ ok: true });
  }
  return jsonOutput({ ok: true, relay: "streamly-zxc" });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ ok: false, error: "bad request body" });
  }
  if (!req || (e.parameter && e.parameter.token !== SECRET)) {
    return jsonOutput({ ok: false, error: "unauthorized" });
  }

  var parsed;
  try {
    parsed = new URL(req.url);
  } catch (err) {
    return jsonOutput({ ok: false, error: "bad target url" });
  }
  if (!hostAllowed(parsed.hostname)) {
    return jsonOutput({ ok: false, error: "host not allowed" });
  }

  var headers = {};
  var incoming = req.headers || {};
  for (var name in incoming) {
    if (!Object.prototype.hasOwnProperty.call(incoming, name)) continue;
    if (BLOCKED_HEADERS[String(name).toLowerCase()]) continue;
    headers[name] = incoming[name];
  }

  var options = {
    method: req.method || "GET",
    headers: headers,
    muteHttpExceptions: true,
    followRedirects: true,
  };
  var method = String(options.method).toUpperCase();
  if (req.body != null && method !== "GET" && method !== "HEAD") {
    options.payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  try {
    var response = UrlFetchApp.fetch(req.url, options);
    var body;
    try {
      body = response.getContentText();
    } catch (textErr) {
      return jsonOutput({ ok: false, error: "upstream body not text" });
    }
    return jsonOutput({
      status: response.getResponseCode(),
      contentType: response.getContentType(),
      body: body,
    });
  } catch (fetchErr) {
    return jsonOutput({ ok: false, error: String(fetchErr) });
  }
}
