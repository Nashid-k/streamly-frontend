import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWatchParty } from "../hooks/useWatchParty";

/* Poll-engine tests for the Watch Party hook: join → connected, chat arrives
   through the same poll with a cursor, repeated failures → status "lost",
   404 → immediate leave. fetch is stubbed at the boundary (the API wrapper is
   thin and typed). Fake timers are enabled BEFORE mounting so the poll chain
   (armed the moment status flips to "connected") is fake-controlled, and
   advanceTimersByTimeAsync lets each tick's fetch microtasks settle. */

const ROOM = (overrides = {}) => ({
  code: "ABC234",
  hostId: "p1",
  title: { titleId: "movie-550", title: "Fight Club", kind: "movie", season: null, episode: null },
  playback: { isPlaying: false, positionSec: 0, updatedAt: 1, rev: 0 },
  participants: [{ participantId: "p1", name: "Host", isHost: true, joinedAt: 1, lastSeenAt: 2 }],
  messages: [],
  ...overrides,
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // Default stub: join/state return a live room; leave/sync/chat succeed.
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (body.action === "join" || body.action === "state") {
        return Promise.resolve(jsonResponse({ success: true, room: ROOM() }));
      }
      return Promise.resolve(jsonResponse({ success: true }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function joinConnected(result, code = "ABC234") {
  await act(async () => {
    await result.current.join({ code, name: "Guest-1" });
  });
  expect(result.current.status).toBe("connected");
}

describe("useWatchParty", () => {
  it("join → connected with a room, and polling starts with the chat cursor", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result);
    expect(result.current.room.code).toBe("ABC234"); // code normalized upper
    expect(result.current.isHost).toBe(false); // hostId p1 ≠ my fresh id
    // Default ROOM() is PAUSED -> the adaptive loop arms the first tick at 5s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    const bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.some((b) => b.action === "state" && b.sinceMsgId === 0)).toBe(true);
  });

  it("chat accumulates through polls without duplicates and advances the cursor", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result);
    vi.mocked(fetch).mockImplementation((url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === "state") {
        const msgs =
          body.sinceMsgId === 0
            ? [{ id: 1, participantId: "p1", name: "Host", text: "one", at: 1 }]
            : [
                { id: 2, participantId: "p1", name: "Host", text: "two", at: 2 },
                { id: 1, participantId: "p1", name: "Host", text: "one", at: 1 }, // server echo dup
              ];
        return Promise.resolve(jsonResponse({ success: true, room: ROOM({ messages: msgs }) }));
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100); // paused cadence (P1.1)
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    expect(result.current.chat.map((m) => m.id)).toEqual([1, 2]);
    // The cursor advances per poll: the first state call went out with 0,
    // the second with 1 (newest seen after poll one). The NEXT request would
    // carry 2 — the cursor the hook holds after processing poll two.
    const bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    const stateCalls = bodies.filter((b) => b.action === "state");
    expect(stateCalls[0].sinceMsgId).toBe(0);
    expect(stateCalls[1].sinceMsgId).toBe(1);
  });

  it("three consecutive poll failures flip the connection to lost", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result);
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error("network gone")));
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100); // paused cadence (P1.1)
      });
    }
    expect(result.current.status).toBe("lost");
    expect(result.current.error).toBeTruthy();
  });

  it("a 404 room-gone answer ends the party immediately with the server's message", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result);
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: false, message: "Party closed." }, 404)),
    );
    // Paused cadence: the first tick lands at 5s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    // Not "lost" — the room is definitively gone, so no retries are burned.
    expect(result.current.status).toBe("left");
    expect(result.current.error).toContain("Party closed");
  });

  it("sendChat posts to the room and reports failure honestly", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result);
    let ok = false;
    await act(async () => {
      ok = await result.current.sendChat("hello party");
    });
    expect(ok).toBe(true);
    const bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.some((b) => b.action === "chat" && b.text === "hello party")).toBe(true);

    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: false, message: "Message cannot be empty." }, 400)),
    );
    let failed = false;
    await act(async () => {
      failed = await result.current.sendChat("x");
    });
    expect(failed).toBe(false);
  });

  it("leave wipes the room locally and calls the endpoint", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result);
    await act(async () => {
      await result.current.leave();
    });
    expect(result.current.room).toBeNull();
    expect(result.current.status).toBe("left");
    const bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.some((b) => b.action === "leave")).toBe(true);
  });

  it("the host's broadcastPlayback posts a sync with isPlaying + position", async () => {
    // Seed the identity BEFORE mount — the hook reads it in its lazy
    // initializer. participantId p1 matches ROOM().hostId, so I am the host.
    localStorage.setItem("streamly_watchparty", JSON.stringify({ participantId: "p1", name: "Host" }));
    const { result } = renderHook(() => useWatchParty({}));
    await act(async () => {
      await result.current.join({ code: "ABC234" });
    });
    expect(result.current.isHost).toBe(true);
    await act(async () => {
      result.current.broadcastPlayback({ isPlaying: true, positionSec: 42, rev: Date.now() });
    });
    const bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    const sync = bodies.find((b) => b.action === "sync");
    expect(sync).toBeTruthy();
    expect(sync.playback).toMatchObject({ isPlaying: true, positionSec: 42 });
  });

  /* Adaptive polling (PLAN.md P1.1): the next tick's delay follows the room's
     playback state — 2s while playing, 5s paused — and a hidden tab stretches
     to 15s. Timers are fake, so the delay is observed by advancing exactly
     one tick's worth and counting state calls. */
  it("polls at 2s while the host plays and backs off to 5s when paused", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result); // ROOM() default: paused → next tick 5s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100); // under 5s: first tick not yet
    });
    let bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.filter((b) => b.action === "state").length).toBe(0); // join is not a poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000); // now past 5s: first poll fires
    });
    bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.filter((b) => b.action === "state").length).toBe(1);

    // Host starts PLAYING: poll 2 (still on the paused re-arm) lands past 5s,
    // answers playing, and poll 3 then rides the 2s cadence.
    vi.mocked(fetch).mockImplementation((url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === "state") {
        return Promise.resolve(
          jsonResponse({ success: true, room: ROOM({ playback: { isPlaying: true, positionSec: 5, updatedAt: 2, rev: 1 } }) }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100); // tick 2 rides the paused re-arm
    });
    bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.filter((b) => b.action === "state").length).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100); // tick 3 rides the playing (2s) re-arm
    });
    bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.filter((b) => b.action === "state").length).toBe(3);
  });

  it("stretches the poll to 15s while the tab is hidden and catches up on return", async () => {
    const { result } = renderHook(() => useWatchParty({}));
    await joinConnected(result);
    const visibility = document.hidden;
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100); // the connect-time arm (5s) still fires
      });
      let bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
      expect(bodies.filter((b) => b.action === "state").length).toBe(1);
      // The re-arm now sees a hidden tab: 15s, not 5s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100); // under 15s: nothing yet
      });
      bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
      expect(bodies.filter((b) => b.action === "state").length).toBe(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000); // past 15s total: fires
      });
      bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
      expect(bodies.filter((b) => b.action === "state").length).toBe(2);
      // Tab visible again → immediate catch-up poll, then 5s cadence resumes.
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);
      });
      bodies = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1].body));
      expect(bodies.filter((b) => b.action === "state").length).toBe(3);
    } finally {
      Object.defineProperty(document, "hidden", { value: visibility, configurable: true });
    }
  });
});
