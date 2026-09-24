// src/pages/NativeProtoPage.jsx — thin wrapper for the /proto-native route.
//
// The player itself lives in src/components/NativePlayerView.jsx so the watch
// page's "native test" play button can render the exact same view. This route
// only supplies query params + the prototype banner.
//
// Usage (after deploy): /proto-native?type=movie&id=693134
//   TV: /proto-native?type=tv&id=1396&season=1&episode=1

import { useNavigate, useSearchParams } from "react-router-dom";
import NativePlayerView from "../components/NativePlayerView";

export default function NativeProtoPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const type = params.get("type") === "tv" ? "tv" : "movie";
  const id = params.get("id") || "693134";
  const season = Number(params.get("season") || 1);
  const episode = Number(params.get("episode") || 1);

  return (
    <div style={{ minHeight: "100dvh", background: "#0a0a0a", color: "#fff", padding: 16 }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <p style={{ fontSize: 12, letterSpacing: 2, color: "#f59e0b", fontWeight: 800 }}>
          NATIVE PLAYBACK PROTOTYPE — TEMPORARY, NOT PRODUCT UI
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 2px" }}>
          Native HLS prototype
        </h1>
        <NativePlayerView type={type} id={id} season={season} episode={episode} onClose={() => navigate(-1)} />
      </div>
    </div>
  );
}
