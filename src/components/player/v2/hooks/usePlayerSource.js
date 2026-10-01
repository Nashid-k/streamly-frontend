import { useEffect, useRef, useState } from "react";
import { PLAYER_SOURCES } from "../../../../constants/sources";
import { E } from "../playbackMachine";
import { OUTCOME, initialLadder, runLadder } from "../sourceLadder";
import { logInfo, logWarn } from "../../../../utils/debugLogger";

const SOURCE_SCOPE = "PlayerSource";

/**
 * The playable URL out of a resolve payload.
 *
 * Mirrors the legacy rule at `NativePlayerView.jsx:2291`: a multi-level master
 * must be opened from `source.url`, while a single rendition prefers `refUrl`.
 * Getting this backwards produces a manifest that 404s on the first segment, so
 * it is spelled out rather than collapsed into `url || refUrl`.
 */
export function extractPlayableUrl(payload) {
  const src = payload?.source || {};
  if (src.multiLevelMaster) return src.url || "";
  return src.refUrl || src.url || "";
}

/**
 * Classify one server's resolve result into a ladder outcome.
 *
 * The `no-source` case is the important one. It is the ONLY result treated as
 * terminal, because it is the only one that means "this provider does not carry
 * this title" — retrying or re-trying it cannot help. Everything else (rate
 * limits, empty catalogue responses, a CDN that timed out) is transient, and the
 * legacy player says so explicitly: an empty list comes back when the catalogue
 * is rate-flaky, not when the title is absent.
 *
 * Exported for testing: this is the rule the whole ladder's fairness rests on.
 */
export function classifyResolve(payload, error) {
  if (error) {
    if (error?.code === "no-source") return OUTCOME.OFF;
    return OUTCOME.RETRY;
  }
  const variants = payload?.variants || [];
  if (variants.length === 0) return OUTCOME.RETRY;
  if (!extractPlayableUrl(payload)) return OUTCOME.RETRY;
  return OUTCOME.SETTLED;
}

/**
 * Does this failure mean "the provider is rate-limited" rather than "no title"?
 *
 * Mirrors the legacy probes at `NativePlayerView.jsx:2490` and `:2588`, which key
 * off a 429 or the word "quota" in the reported reason. The viewer sees the same
 * black screen either way, but only this one clears by itself — so claiming "no
 * server has this title" during a rate limit is a false statement about their
 * catalogue.
 */
export function looksRateLimited(error) {
  return /\b429\b|quota|rate.?limit/i.test(String(error?.message || error || ""));
}

/**
 * Resolve a title through the source ladder (task.md 6.3 / 2.10).
 *
 * Owns exactly one thing: walking servers until one yields a playable URL, then
 * telling the playback machine. All the decisions live in `sourceLadder.js`, which
 * is pure and exhaustively tested; this hook supplies the network call and the
 * abort plumbing.
 *
 * @param {object} options
 * @param {{ type?: string, id?: unknown, season?: number, episode?: number,
 *   originalLanguage?: string }} options.args resolve arguments.
 * @param {(event: string, error?: unknown) => void} options.send dispatch into
 *   the playback machine.
 * @param {Array} [options.sources] injected for tests; production uses the app's
 *   single ordered catalogue so numbering and rotation cannot diverge.
 * @param {string|null} [options.pinnedKey] a manual server pick, honoured for
 *   one pass (the Servers menu lands in Phase 4).
 * @param {boolean} [options.enabled] false skips resolution entirely — used when
 *   there is no title to resolve, so a player mounted without an `id` never
 *   reaches the network.
 */
export default function usePlayerSource({
  args = {},
  send,
  sources = PLAYER_SOURCES,
  pinnedKey = null,
  retries = 1,
  enabled = true,
} = {}) {
  const [resolved, setResolved] = useState(null);
  const [ladderState, setLadderState] = useState(null);

  // Serialised so the effect re-runs on an episode change but not on every
  // parent render producing a fresh object literal.
  const argsKey = JSON.stringify({
    type: args.type ?? null,
    id: args.id ?? null,
    season: args.season ?? null,
    episode: args.episode ?? null,
    originalLanguage: args.originalLanguage ?? null,
  });

  const runIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !send) return undefined;
    if (args.id == null || args.id === "") {
      // Nothing to resolve. Say so rather than firing a request that is
      // guaranteed to fail and reporting it as a source problem.
      logWarn(SOURCE_SCOPE, "no title id; skipping resolution");
      return undefined;
    }

    const controller = new AbortController();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    let current = true;

    // Drop the previous answer before starting. Keeping it would let the OLD
    // episode's URL stay on screen (and in the video element) while the new one
    // resolves — the viewer would watch the wrong episode rather than the loader.
    setResolved(null);
    setLadderState(null);

    // A new title is a new load, and the machine has to be told.
    //
    // Without this, an episode change left the machine in `playing` while the new
    // ladder ran: no loader, the old element torn down to nothing, and the eventual
    // SOURCE_READY refused because `playing` cannot accept it. The player sat black
    // with no way back. RESET lands on IDLE (not RESOLVING) and only IDLE accepts
    // REQUEST, so both are needed; React batches them into one render, so there is
    // no visible flicker through the intermediate IDLE.
    send(E.RESET);
    send(E.REQUEST);

    const resolveArgs = {
      type: args.type || "movie",
      id: args.id,
      season: args.season,
      episode: args.episode,
      originalLanguage: args.originalLanguage,
    };

    // Returns an envelope so the resolved manifest survives the walk — the
    // ladder hands back the winning SOURCE, and without this the URL is lost.
    //
    // It also catches its OWN errors and classifies them here, deliberately.
    // Resolvers signal "this provider does not carry this title" by throwing with
    // `code: "no-source"`, so a classifier that only saw successful returns would
    // never see the one terminal case. Letting the throw escape to runLadder's
    // catch would blur it back into "retry" — which is exactly the bug that made a
    // missing title burn its whole retry budget.
    const attempt = async (source) => {
      try {
        const payload = await source.resolve(resolveArgs, { signal: controller.signal });
        return { outcome: classifyResolve(payload), payload };
      } catch (error) {
        return { outcome: classifyResolve(null, error), error, quota: looksRateLimited(error) };
      }
    };

    runLadder({
      state: initialLadder({ sources, pinnedKey, retries }),
      isAborted: () => controller.signal.aborted,
      attempt,
      onAttempt: ({ source: tried, outcome }) => {
        logInfo(SOURCE_SCOPE, `${tried.label}: ${outcome}`);
      },
    })
      .then(({ source: winner, result, ladder }) => {
        // A newer run (episode change, close) owns the state now; this result is
        // stale and must not be allowed to overwrite it.
        if (!current || runId !== runIdRef.current) return;

        setLadderState(ladder);
        if (!winner) {
          const quota = ladder.upstreamQuota
            ? "Every server is rate-limited right now — this clears on its own."
            : "No server has this title right now.";
          send(E.FAIL, new Error(quota));
          return;
        }
        const payload = result?.payload;
        setResolved({ source: winner, payload, url: extractPlayableUrl(payload) });
        send(E.SOURCE_READY);
      })
      .catch((error) => {
        if (!current || runId !== runIdRef.current) return;
        logWarn(SOURCE_SCOPE, "ladder run failed", error);
        setLadderState(null);
        send(E.FAIL, error instanceof Error ? error : new Error(String(error)));
      });

    return () => {
      current = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, argsKey, pinnedKey, retries, send]);

  return { resolved, url: resolved?.url || "", ladder: ladderState };
}
