/* Confirms the resolver 400 the APK hits: same title, the app's id vs the web's id. */
const API = "https://streamlyvercelin.vercel.app/api/downloadify";

async function post(body) {
  const t0 = Date.now();
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 120);
  }
  const shape =
    parsed && typeof parsed === "object"
      ? `ok=${parsed.ok} code=${parsed.code || "-"} error=${parsed.error || "-"} variants=${parsed.variants?.length ?? "-"}`
      : "";
  console.log(
    `http=${res.status} ${String(Date.now() - t0).padStart(5)}ms  ${JSON.stringify(body)}\n     ${shape}`,
  );
  return { status: res.status, parsed };
}

console.log("=== movie 27205 (Inception)");
await post({ action: "resolvevidcore", type: "movie", id: "movie-27205" }); // what the APK sends
await post({ action: "resolvevidcore", type: "movie", id: "27205" }); // what the web sends
await post({ action: "resolvevidsrc", type: "movie", id: "movie-27205" });
await post({ action: "resolvevidsrc", type: "movie", id: "27205" });

console.log("\n=== tv 1399 (Game of Thrones)");
await post({ action: "resolvevidcore", type: "tv", id: "tv-1399", season: "1", episode: "1" });
await post({ action: "resolvevidcore", type: "tv", id: "1399", season: "1", episode: "1" });
console.log("--- tv with no episode (what the app sends when the series Play button is used):");
await post({ action: "resolvevidcore", type: "tv", id: "1399", season: "1" });
