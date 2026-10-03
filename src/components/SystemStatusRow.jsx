// src/components/SystemStatusRow.jsx — "System status" row (PLAN.md P1.4).
//
// Reads GET /api/usage (on-demand only — nothing polls) and shows how close
// the shared free-tier capacity is to its daily ceiling. The no-silent-failure
// rule applies to capacity too: a viewer should never discover a quota by
// playback dying. Degraded/unavailable states are honest text, never blank.

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { logDebug } from "../utils/debugLogger";

const SCOPE_LABELS = {
  dl: "Relay",
  tmdb: "Catalog",
};

export default function SystemStatusRow() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage", { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        if (!body?.ok) throw new Error(body?.message || "ledger unavailable");
        setState({ status: "ok", scopes: body.scopes || {} });
      } catch (error) {
        if (cancelled) return;
        logDebug("usage", "System status fetch failed.", { message: error?.message });
        setState({ status: "unavailable", message: error?.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  let description;
  if (state.status === "loading") {
    description = "Checking capacity…";
  } else if (state.status === "unavailable" || Object.keys(state.scopes || {}).length === 0) {
    description = "Capacity numbers are not available right now — playback is unaffected.";
  } else {
    const parts = Object.entries(SCOPE_LABELS)
      .filter(([scope]) => state.scopes[scope])
      .map(([scope, label]) => `${label} ${state.scopes[scope].pct}%`);
    description = parts.length
      ? `Today's shared capacity used — ${parts.join(" · ")}`
      : "All counters empty today — plenty of headroom.";
  }

  return (
    <div className="setting-row">
      <div className="setting-meta">
        <span className="setting-title">System status</span>
        <span className="setting-desc">{description}</span>
      </div>
      <div className="setting-control">
        <span className="px-3.5 py-1.5 rounded-full bg-white/5 text-white/70 text-xs font-medium flex items-center gap-1">
          <Activity className="w-3.5 h-3.5" aria-hidden="true" />
          {state.status === "loading" ? "…" : state.status === "ok" ? "Live" : "—"}
        </span>
      </div>
    </div>
  );
}
