export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    if (incoming.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    const target = incoming.searchParams.get("url");
    if (!target) {
      return new Response("missing ?url=", { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return new Response("bad ?url=", { status: 400 });
    }
    if (parsed.protocol !== "https:") {
      return new Response("https only", { status: 400 });
    }

    const referer = incoming.searchParams.get("referer") || parsed.origin + "/";

    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
    };

    const range = request.headers.get("Range");
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(parsed.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const body = upstream.body;
    if (!body) {
      return new Response(null, { status: upstream.status });
    }

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/octet-stream",
      },
    });
  },
};