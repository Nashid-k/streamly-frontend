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
 *      Nothing else is needed — the client asks api/stream.js `capabilities`
 *      whether a relay is configured and picks the native engine on its own.
 *   7. Redeploy the Vercel project so the function picks up the variable.
 *
 * CONTRACT (server -> relay, GET on the /exec URL; relay -> server, JSON body)
 *   query  ?token=<SECRET>&url=<enc>&method=<GET|POST>[&referer=][&origin=]
 *          [&accept=][&ctype=][&body=<enc>]
 *   response { status, contentType, body }   // body is always text
 *   ?ping=1 returns { ok: true } for a health check.
 *
 *   GET, not POST: Apps Script redirects a POST to script.googleusercontent.com
 *   and clients drop the body when they follow it. The few small TEXT requests
 *   the resolver needs fit comfortably in a query string.
 */

var SECRET = "CHANGE_ME_TO_A_RANDOM_STRING";

// The relay only talks to the playback provider — a leaked URL can never turn
// it into a general-purpose open proxy.
var ALLOWED_HOSTS = ["zxcstream.cc", "vidstuck.cc", "vidstuck.xyz"];

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
  if (!e || !e.parameter || !e.parameter.url) {
    return jsonOutput({ ok: true, relay: "streamly-zxc" });
  }
  return proxy(e.parameter);
}

// Secondary path. Apps Script redirects a POST to script.googleusercontent.com
// and most HTTP clients drop the body when they follow it, so the server drives
// proxy() through doGet instead; this stays for manual curl testing.
function doPost(e) {
  if (e && e.parameter && e.parameter.token !== SECRET) {
    return jsonOutput({ ok: false, error: "unauthorized" });
  }
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ ok: false, error: "bad request body" });
  }
  if (!req) {
    return jsonOutput({ ok: false, error: "unauthorized" });
  }
  var params = { url: req.url, method: req.method };
  var headers = req.headers || {};
  for (var name in headers) {
    if (!Object.prototype.hasOwnProperty.call(headers, name)) continue;
    params[String(name).toLowerCase()] = headers[name];
  }
  if (req.body != null) params.body = req.body;
  return proxy(params);
}

function proxy(p) {
  // NOTE: Apps Script's V8 runtime does not reliably expose the WHATWG `URL`
  // constructor, so parse the host with a regex instead of `new URL(...)`.
  var match = String(p.url || "").match(/^https?:\/\/([^\/?#]+)/i);
  if (!match) {
    return jsonOutput({ ok: false, error: "bad target url" });
  }
  if (!hostAllowed(match[1].split(":")[0])) {
    return jsonOutput({ ok: false, error: "host not allowed" });
  }

  var headers = {};
  var forwarded = ["referer", "origin", "accept", "content-type"];
  for (var i = 0; i < forwarded.length; i++) {
    var key = forwarded[i];
    if (p[key] != null && p[key] !== "") headers[key] = String(p[key]);
  }
  // The query form uses a short alias for the request content-type.
  if (p.ctype != null && p.ctype !== "") headers["content-type"] = String(p.ctype);

  var options = {
    method: String(p.method || "GET").toUpperCase(),
    headers: headers,
    muteHttpExceptions: true,
    followRedirects: true,
  };
  if (p.body != null && options.method !== "GET" && options.method !== "HEAD") {
    options.payload = typeof p.body === "string" ? p.body : JSON.stringify(p.body);
  }

  try {
    var response = UrlFetchApp.fetch(p.url, options);
    var body;
    try {
      body = response.getContentText();
    } catch (textErr) {
      return jsonOutput({ ok: false, error: "upstream body not text" });
    }
    // HTTPResponse has no getContentType(); the content type lives in the
    // header map (header names arrive with their original casing).
    var respHeaders = response.getHeaders();
    var contentType = respHeaders["Content-Type"] || respHeaders["content-type"] || "";
    return jsonOutput({
      status: response.getResponseCode(),
      contentType: contentType,
      body: body,
    });
  } catch (fetchErr) {
    return jsonOutput({ ok: false, error: String(fetchErr) });
  }
}
