import server from "../server/dist/main.js";

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = server.createApp();
  }
  return appPromise;
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    // If app creation itself fails, surface a 500 instead of a silent hang.
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Backend failed to initialize" }));
    } else {
      res.end();
    }
    console.error("[API] fatal handler error:", err);
  }
}