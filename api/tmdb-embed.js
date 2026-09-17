// api/tmdb-embed.js — TMDB Embed API with direct MP4 download providers
//
// Self-hosted TMDB Embed API that resolves direct MP4 download links
// from providers that serve direct files instead of HLS streams.
//
// Providers implemented:
//   - dahmermovies: Direct file links
//   - streamflix: Direct MP4 links
//
// Endpoints:
//   GET /api/tmdb-embed/movie/:tmdbId  -> Direct download links for a movie
//   GET /api/tmdb-embed/tv/:tmdbId/:season/:episode -> Direct download links for TV episode

export const config = { maxDuration: 30 };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// DahmerMovies provider - direct file links
async function getDahmerMovies(tmdbId, type = "movie", season = null, episode = null) {
  try {
    let url;
    if (type === "movie") {
      url = `https://dahmermovies.site/movie/${tmdbId}`;
    } else {
      url = `https://dahmermovies.site/tv/${tmdbId}/${season}/${episode}`;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://dahmermovies.site/",
      },
    });

    if (!response.ok) {
      throw new Error(`DahmerMovies HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Extract direct MP4 links from the page
    const mp4Matches = html.match(/https?:\/\/[^\s"']+\.(?:mp4|mkv)[^\s"']*/gi);
    
    if (!mp4Matches || mp4Matches.length === 0) {
      return [];
    }

    return mp4Matches.map((url, index) => ({
      url: url.replace(/\\\//g, "/"),
      quality: index === 0 ? "1080p" : "720p",
      provider: "dahmermovies",
    }));
  } catch (error) {
    console.error("[TMDB-Embed] DahmerMovies error:", error.message);
    return [];
  }
}

// Streamflix provider - direct MP4 links
async function getStreamflix(tmdbId, type = "movie", season = null, episode = null) {
  try {
    let url;
    if (type === "movie") {
      url = `https://flixhq.stream/movie/${tmdbId}`;
    } else {
      url = `https://flixhq.stream/tv/${tmdbId}/${season}/${episode}`;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://flixhq.stream/",
      },
    });

    if (!response.ok) {
      throw new Error(`Streamflix HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Extract direct MP4 links from the page
    const mp4Matches = html.match(/https?:\/\/[^\s"']+\.(?:mp4|mkv)[^\s"']*/gi);
    
    if (!mp4Matches || mp4Matches.length === 0) {
      return [];
    }

    return mp4Matches.map((url, index) => ({
      url: url.replace(/\\\//g, "/"),
      quality: index === 0 ? "1080p" : "720p",
      provider: "streamflix",
    }));
  } catch (error) {
    console.error("[TMDB-Embed] Streamflix error:", error.message);
    return [];
  }
}

// Aggregate results from all providers
async function getDownloads(tmdbId, type = "movie", season = null, episode = null) {
  const results = await Promise.all([
    getDahmerMovies(tmdbId, type, season, episode),
    getStreamflix(tmdbId, type, season, episode),
  ]);

  const allDownloads = results.flat();
  
  // Deduplicate by URL
  const uniqueDownloads = [];
  const seenUrls = new Set();
  
  for (const download of allDownloads) {
    if (!seenUrls.has(download.url)) {
      seenUrls.add(download.url);
      uniqueDownloads.push(download);
    }
  }

  return uniqueDownloads;
}

// Vercel serverless function handler
export default async function handler(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Parse TMDB ID from path
    // /api/tmdb-embed/movie/:tmdbId
    // /api/tmdb-embed/tv/:tmdbId/:season/:episode
    const movieMatch = pathname.match(/^\/api\/tmdb-embed\/movie\/(\d+)$/);
    const tvMatch = pathname.match(/^\/api\/tmdb-embed\/tv\/(\d+)\/(\d+)\/(\d+)$/);

    if (movieMatch) {
      const tmdbId = movieMatch[1];
      const downloads = await getDownloads(tmdbId, "movie");
      
      return res.status(200).json({
        ok: true,
        tmdbId,
        type: "movie",
        downloads: downloads.length > 0 ? downloads : [],
        count: downloads.length,
      });
    }

    if (tvMatch) {
      const tmdbId = tvMatch[1];
      const season = tvMatch[2];
      const episode = tvMatch[3];
      const downloads = await getDownloads(tmdbId, "tv", season, episode);
      
      return res.status(200).json({
        ok: true,
        tmdbId,
        type: "tv",
        season,
        episode,
        downloads: downloads.length > 0 ? downloads : [],
        count: downloads.length,
      });
    }

    return res.status(404).json({
      ok: false,
      error: "Invalid endpoint",
      code: "not-found",
    });
  } catch (error) {
    console.error("[TMDB-Embed] Handler error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Internal server error",
      code: "server-error",
    });
  }
}
