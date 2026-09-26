import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DownloadModal from "../components/DownloadModal";
import { ToastProvider } from "../components/Toast.jsx";
import { DownloadsProvider } from "../context/DownloadsContext";
import { useDownloads } from "../context/downloads";
import { downloadService } from "../api/downloadService";
import { movieService } from "../api/movieService";
import { PreferencesContext } from "../context/preferences";

vi.mock("../api/downloadService", () => ({
  downloadService: {
    resolveVidsrc: vi.fn(),
    resolveVidcore: vi.fn(),
    buildManifest: vi.fn(),
    pickSaveTarget: vi.fn(),
    saveStream: vi.fn(),
  },
  DownloadUnavailableError: class DownloadUnavailableError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  },
  createPauseController: () => {
    let paused = false;
    let release = null;
    let gate = Promise.resolve();
    return {
      isPaused: () => paused,
      pause: () => {
        if (paused) return;
        paused = true;
        gate = new Promise((resolve) => {
          release = resolve;
        });
      },
      resume: () => {
        if (!paused) return;
        paused = false;
        release?.();
        release = null;
        gate = Promise.resolve();
      },
      async waitIfPaused({ signal } = {}) {
        if (signal?.aborted) return;
        while (paused) {
          if (signal) {
            const abortPromise = new Promise((resolve) => {
              if (signal.aborted) return resolve();
              signal.addEventListener("abort", () => resolve(), { once: true });
            });
            await Promise.race([gate, abortPromise]);
          } else {
            await gate;
          }
          if (signal?.aborted) return;
        }
      },
    };
  },
}));

vi.mock("../api/movieService", () => ({
  movieService: {
    getExternalIds: vi.fn(),
    getSeasonEpisodes: vi.fn(),
  },
}));

const MOVIE = { id: "movie-550", title: "Fight Club", releaseYear: "1999", durationMins: 139 };
const SERVERS = [
  { name: "Server 1", url: () => "https://cinesrc.st/embed/movie/550" },
  { name: "Server 2", url: () => "https://vidlink.pro/movie/550" },
];
const VARIANTS = [
  { uri: "https://cdn/4k.m3u8", bandwidth: 16000000, width: 3840, height: 2160, hdr: true },
  { uri: "https://cdn/1080.m3u8", bandwidth: 8000000, width: 1920, height: 1080, hdr: false },
  { uri: "https://cdn/720.m3u8", bandwidth: 3000000, width: 1280, height: 720, hdr: false },
];

function renderModal(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DownloadModal movie={MOVIE} servers={SERVERS} isTvContent={false} onClose={() => {}} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/* Probes the DownloadsContext so the test can assert what the modal wrote
   into the session store (mirrors how the /downloads page reads it). */
function StoreProbe({ children, onStore }) {
  const store = useDownloads();
  useEffect(() => {
    onStore(store);
  });
  return children;
}

function renderModalWithStore(props = {}, onStore) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DownloadsProvider>
          <StoreProbe onStore={onStore}>
            <DownloadModal movie={MOVIE} servers={SERVERS} isTvContent={false} onClose={() => {}} {...props} />
          </StoreProbe>
        </DownloadsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.body.style.overflow = "";
  vi.clearAllMocks();
  movieService.getExternalIds.mockResolvedValue({ imdb_id: "tt0137523" });
  movieService.getSeasonEpisodes.mockResolvedValue({ episodes: [] });
  downloadService.pickSaveTarget.mockResolvedValue(null);
  // VidCore (Server 5) is serverless; default it to a soft no-source so the
  // rows-tested base (VidSrc alone) stays stable. Dedicated tests override it.
  downloadService.resolveVidcore.mockRejectedValue(new Error("no source"));
  downloadService.buildManifest.mockResolvedValue({ kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s"], count: 1 });
  downloadService.saveStream.mockResolvedValue({ bytes: 2048, filename: "f.mp4", method: "blob" });
});

describe("DownloadModal", () => {
  it("lists only the qualities the server actually offers", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    renderModal();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Row badge carries the verified tag; the filter rail chip stays resolution-only.
    expect((await screen.findAllByText("4K HDR")).length).toBeGreaterThanOrEqual(1);
    expect(downloadService.resolveVidsrc).toHaveBeenCalledWith(
      { type: "movie", id: "550", season: undefined, episode: undefined },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("downloads the chosen variant through saveStream", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    renderModal();

    // Find and click the first "Download" action button
    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => expect(downloadService.saveStream).toHaveBeenCalledTimes(1));
    expect(downloadService.buildManifest).toHaveBeenCalledTimes(1);
  });

  it("can switch to browser downloads — skips the save picker and forces mode:'browser'", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          {/* PreferencesProvider's context value is FLAT: { ...preferences,
             setPreference, resetPreferences } — mirrors src/context/preferences.js. */}
          <PreferencesContext.Provider
            value={{ browserDownloads: true, setPreference: vi.fn(), resetPreferences: vi.fn() }}
          >
            <DownloadModal movie={MOVIE} servers={SERVERS} isTvContent={false} onClose={() => {}} />
          </PreferencesContext.Provider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => expect(downloadService.saveStream).toHaveBeenCalledTimes(1));
    expect(downloadService.pickSaveTarget).not.toHaveBeenCalled();
    expect(downloadService.saveStream).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "browser" }),
    );
  });

  it("lets you click a row while a slow source is still resolving", async () => {
    downloadService.resolveVidsrc
      .mockReturnValue(new Promise((resolve) => setTimeout(() => resolve({ source: { url: "slow" }, variants: VARIANTS }), 100)));
    renderModal();

    // VidSrc (Alt) is still minting — nothing is shown yet, so no rows exist
    // until the slow source lands.
    expect(screen.queryByRole("button", { name: /^Download \d/i })).not.toBeInTheDocument();

    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    expect(downloadButtons[0]).not.toBeDisabled();
    fireEvent.click(downloadButtons[0]);
    await waitFor(() => expect(downloadService.saveStream).toHaveBeenCalledTimes(1));
  });

  it("shows an honest error when no source offers a downloadable file", async () => {
    downloadService.resolveVidsrc.mockRejectedValue(new Error("no source"));
    renderModal();

    const dialog = await screen.findByRole("dialog");
    expect(
      await screen.findByText(/VidSrc \(Alt\) did not offer a downloadable version of this title/i),
    ).toBeInTheDocument();
    // VidCore also named — the sheet never hides that a source was tried.
    expect(dialog).toHaveTextContent(/VidCore \(Server 5\) did not offer a downloadable version of this title/i);
  });

  it("adds VidCore (Server 5) quality rows alongside VidSrc (Alt)", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    downloadService.resolveVidcore.mockResolvedValue({
      source: { url: "https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8", refUrl: "https://vidcore.io/" },
      variants: [{ uri: "https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8", bandwidth: 16000000, height: 2160, hdr: false }],
    });
    renderModal();

    await waitFor(() => expect(downloadService.resolveVidcore).toHaveBeenCalledWith(
      { type: "movie", id: "550", season: undefined, episode: undefined },
      expect.objectContaining({ signal: expect.anything() }),
    ));
    expect(await screen.findByText(/VidCore \(Server 5\)/)).toBeInTheDocument();
  });

  it("keeps a second source's soft failure from sinking the sheet", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    // beforeEach rejects resolveVidcore with a plain error.
    renderModal();

    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    expect(downloadButtons.length).toBe(3);
    // No global error — the sheet is usable with only the VidSrc rows.
    expect(screen.queryByText(/did not offer a downloadable version/i)).not.toBeInTheDocument();
  });

  it("locks body scroll and closes on Escape", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    const onClose = vi.fn();
    renderModal({ onClose });

    await screen.findByRole("dialog");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("registers the download in the shared store and marks it done", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });

    let storeSnapshot = null;
    renderModalWithStore({}, (store) => {
      storeSnapshot = store;
    });

    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    fireEvent.click(downloadButtons[0]);
    await waitFor(() => expect(downloadService.saveStream).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      const record = storeSnapshot.downloads.find((d) => d.title === "Fight Club");
      expect(record).toBeDefined();
      expect(record.status).toBe("done");
      expect(record.quality).toBe("4K HDR");
      expect(record.serverName).toBe("VidSrc (Alt)");
    });
  });

  it("marks the stored download cancelled when aborted", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    downloadService.saveStream.mockImplementation(
      (opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    );

    let storeSnapshot = null;
    renderModalWithStore({}, (store) => {
      storeSnapshot = store;
    });

    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    fireEvent.click(downloadButtons[0]);
    await waitFor(() => expect(downloadService.saveStream).toHaveBeenCalledTimes(1));

    // The store's abort closure must abort the real controller backing the modal.
    await waitFor(() => expect(storeSnapshot.downloads.length).toBeGreaterThan(0));
    const record = storeSnapshot.downloads.find((d) => d.title === "Fight Club");
    record.abort();

    await waitFor(() => expect(storeSnapshot.downloads.find((d) => d.id === record.id).status).toBe("cancelled"));
  });

  it("keeps the download running after the modal closes — Escape does not abort", async () => {
    downloadService.resolveVidsrc.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });

    let captured = null;
    downloadService.saveStream.mockImplementation((opts) => {
      captured = opts;
      return Promise.resolve({ bytes: 2048, filename: "f.mp4", method: "blob" });
    });

    let storeSnapshot = null;
    renderModalWithStore({}, (store) => {
      storeSnapshot = store;
    });

    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    fireEvent.click(downloadButtons[0]);
    await waitFor(() => expect(captured).not.toBeNull());

    fireEvent.keyDown(document, { key: "Escape" });

    // No abort fires: the loop keeps pulling and the record reaches "done".
    await waitFor(() => {
      const record = storeSnapshot.downloads.find((d) => d.title === "Fight Club");
      expect(record).toBeDefined();
      expect(record.status).toBe("done");
    });
    expect(captured.signal.aborted).toBe(false);
  });
});
