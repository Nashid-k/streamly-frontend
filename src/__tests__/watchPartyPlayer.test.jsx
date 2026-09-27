import { describe, expect, it, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NativePlayerView from "../components/NativePlayerView";

// jsdom has no ResizeObserver; the player measures its frame with it.
beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

/* A minimal connected-party controller shaped exactly like the useWatchParty
   return value the page hands the player — no network, no timers. */
function fakeParty(overrides = {}) {
  return {
    identity: { participantId: "p1", name: "Host" },
    room: {
      code: "ABC234",
      hostId: "p1",
      title: { titleId: "movie-550", title: "Fight Club", kind: "movie", season: null, episode: null },
      participants: [
        { participantId: "p1", name: "Host", isHost: true, joinedAt: 1, lastSeenAt: 2 },
        { participantId: "p2", name: "Guest", isHost: false, joinedAt: 2, lastSeenAt: 2 },
      ],
      playback: { isPlaying: false, positionSec: 0, updatedAt: 0, rev: 0 },
    },
    isHost: true,
    status: "connected",
    error: null,
    chat: [{ id: 1, participantId: "p2", name: "Guest", text: "hi", at: 1 }],
    remotePlayback: null,
    create: () => {},
    join: () => {},
    leave: () => {},
    sendChat: () => Promise.resolve(true),
    renameSelf: () => true,
    broadcastPlayback: () => true,
    ...overrides,
  };
}

/* Watch Party player integration. The party surface must mount inside the
   player's render pass (jsdom takes the fatal path here too — the point is
   that the Users button, panel and party effects all coexist with the solo
   player, and that solo playback renders none of it). */
describe("NativePlayerView × Watch Party", () => {
  it("solo playback shows no party UI (party prop absent)", () => {
    render(<NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /watch party/i })).toBeNull();
  });

  it("with a connected party, the Users button renders and opens the panel", async () => {
    render(
      <NativePlayerView
        type="movie"
        id="550"
        title="Fight Club"
        onClose={() => {}}
        party={fakeParty()}
      />,
    );
    const btn = screen.getByRole("button", { name: /watch party/i });
    fireEvent.click(btn);
    // Panel header + connected state: code chip and host line are visible.
    await waitFor(() => expect(screen.getByText("ABC234")).toBeInTheDocument());
    expect(screen.getByText(/you control playback for everyone/i)).toBeInTheDocument();
  });

  it("guests see the host-controls line and the member roster", async () => {
    render(
      <NativePlayerView
        type="movie"
        id="550"
        title="Fight Club"
        onClose={() => {}}
        party={fakeParty({
          isHost: false,
          identity: { participantId: "p2", name: "Guest" },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /watch party/i }));
    await waitFor(() =>
      expect(screen.getByText(/controls playback\. sit back and chat/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Host · host/i)).toBeInTheDocument();
    expect(screen.getByText(/Guest \(you\)/i)).toBeInTheDocument();
  });

  it("chat messages render in the panel log", async () => {
    render(
      <NativePlayerView
        type="movie"
        id="550"
        title="Fight Club"
        onClose={() => {}}
        party={fakeParty()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /watch party/i }));
    await waitFor(() => expect(screen.getByText("hi")).toBeInTheDocument());
    expect(screen.getByRole("log", { name: /party chat/i })).toBeInTheDocument();
  });
});
