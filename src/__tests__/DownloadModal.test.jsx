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

vi.mock("../api/downloadService", () => ({
  downloadService: {
    resolveDownload: vi.fn(),
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
  downloadService.buildManifest.mockResolvedValue({ kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s"], count: 1 });
  downloadService.saveStream.mockResolvedValue({ bytes: 2048, filename: "f.mp4", method: "blob" });
});

describe("DownloadModal", () => {
  it("lists only the qualities the server actually offers", async () => {
    downloadService.resolveDownload.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    renderModal();

    expect(await screen.findByRole("dialog", { name: /download/i })).toBeInTheDocument();
    // Quality badges appear in source rows and possibly filter rail
    expect(screen.getAllByText("4K HDR").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("1080p").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("720p").length).toBeGreaterThanOrEqual(2);
    expect(downloadService.resolveDownload).toHaveBeenCalledWith(
      "https://cinesrc.st/embed/movie/550",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("downloads the chosen variant through saveStream", async () => {
    downloadService.resolveDownload.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    renderModal();

    // Find and click the first "Download" action button
    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => expect(downloadService.saveStream).toHaveBeenCalledTimes(1));
    expect(downloadService.buildManifest).toHaveBeenCalledTimes(1);
  });

  it("lets you click a row while other sources are still being scanned", async () => {
    downloadService.resolveDownload
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ source: { url: "slow" }, variants: VARIANTS }), 5000)))
      .mockResolvedValueOnce({ source: { url: "m" }, variants: VARIANTS });
    renderModal();

    // First source resolves fast; the second is still pending, so
    // resolveState stays "resolving" — the fast row must still be enabled.
    const downloadButtons = await screen.findAllByRole("button", { name: /^Download \d/i });
    expect(downloadButtons[0]).not.toBeDisabled();

    fireEvent.click(downloadButtons[0]);
    await waitFor(() => expect(downloadService.saveStream).toHaveBeenCalledTimes(1));
  });

  it("tries the next server when one has no downloadable source", async () => {
    downloadService.resolveDownload
      .mockRejectedValueOnce(new Error("no source"))
      .mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    renderModal();

    await screen.findAllByText("1080p");
    expect(downloadService.resolveDownload).toHaveBeenCalledTimes(3);
  });

  it("shows an honest error when no server can be downloaded", async () => {
    downloadService.resolveDownload.mockRejectedValue(new Error("no source"));
    renderModal();

    expect(
      await screen.findByText(/none of the servers offered a downloadable file/i),
    ).toBeInTheDocument();
  });

  it("locks body scroll and closes on Escape", async () => {
    downloadService.resolveDownload.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
    const onClose = vi.fn();
    renderModal({ onClose });

    await screen.findByRole("dialog", { name: /download/i });
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("registers the download in the shared store and marks it done", async () => {
    downloadService.resolveDownload.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });

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
      expect(record.serverName).toBe("Server 1");
    });
  });

  it("marks the stored download cancelled when aborted", async () => {
    downloadService.resolveDownload.mockResolvedValue({ source: { url: "m" }, variants: VARIANTS });
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
});
