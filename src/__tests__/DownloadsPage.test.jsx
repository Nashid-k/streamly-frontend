import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect, useState } from "react";
import { DownloadsProvider } from "../context/DownloadsContext";
import { useDownloads } from "../context/downloads";
import DownloadsPage from "../pages/DownloadsPage";

/* A harness that exposes the store mutations for triggering state, mirroring
   how DownloadModal drives the same context in production (register first,
   then update progress/status via the returned id). */
function StorePump({ children, seed }) {
  const { registerDownload, updateDownload } = useDownloads();

  useEffect(() => {
    if (!seed) return;
    const id = registerDownload({ ...seed.meta });
    if (seed.flows) {
      // eslint-disable-next-line no-restricted-syntax
      for (const flow of seed.flows) {
        updateDownload(id, flow);
      }
    }
  }, [seed, registerDownload, updateDownload]);

  return children;
}

function renderPage(seed = null) {
  return render(
    <MemoryRouter initialEntries={["/downloads"]}>
      <DownloadsProvider>
        <StorePump seed={seed}>
          <DownloadsPage />
        </StorePump>
      </DownloadsProvider>
    </MemoryRouter>,
  );
}

const BASE_META = {
  title: "Fight Club",
  quality: "1080p",
  serverName: "Server 1",
  posterUrl: "/abc.jpg",
  backdropUrl: null,
  isTv: false,
  episodeCount: 1,
  status: "downloading",
};

describe("DownloadsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state when no downloads exist", async () => {
    renderPage();
    expect(await screen.findByText(/no downloads yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discover content/i })).toBeInTheDocument();
  });

  it("lists active and completed downloads with metadata", async () => {
    renderPage({ meta: BASE_META });

    expect(await screen.findByText("Fight Club")).toBeInTheDocument();
    expect(screen.getByText("1080p")).toBeInTheDocument();
    expect(screen.getByText(/server 1/i)).toBeInTheDocument();
    expect(screen.getByText("Downloading")).toBeInTheDocument();
  });

  it("shows live progress while downloading", async () => {
    renderPage({
      meta: BASE_META,
      flows: [
        {
          status: "downloading",
          progress: {
            ratio: 0.5,
            bytesLabel: "5.0 MB",
            totalBytes: 10 * 1024 * 1024,
            speed: 2 * 1024 * 1024,
          },
        },
      ],
    });

    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/2.0 MB\/s/)).toBeInTheDocument();
    expect(screen.getByText(/5.0 MB \/ 10.0 MB/)).toBeInTheDocument();
  });

  it("marks completed downloads as saved", async () => {
    renderPage({
      meta: BASE_META,
      flows: [{ status: "done", progress: { ratio: 1, bytesLabel: "10 MB", totalBytes: 10 * 1024 * 1024 } }],
    });

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText(/remove fight club from downloads/i)).toBeInTheDocument();
  });

  it("shows an honest error state", async () => {
    renderPage({
      meta: BASE_META,
      flows: [{ status: "error", error: "Server refused the stream." }],
    });

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Server refused the stream.")).toBeInTheDocument();
  });

  it("shows a paused download with Resume and Cancel actions", async () => {
    const resume = vi.fn();
    renderPage({
      meta: BASE_META,
      flows: [
        {
          status: "paused",
          progress: { ratio: 0.5, bytesLabel: "5.0 MB", totalBytes: 10 * 1024 * 1024 },
          pause: vi.fn(),
          resume,
          retry: vi.fn(),
        },
      ],
    });

    expect(await screen.findByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByLabelText(/resume download of fight club/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cancel download of fight club/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/resume download of fight club/i));
    expect(resume).toHaveBeenCalled();
  });

  it("retries a failed download through the stored retry closure", async () => {
    const retry = vi.fn();
    renderPage({
      meta: BASE_META,
      flows: [
        {
          status: "error",
          error: "Client side error",
          pause: vi.fn(),
          resume: vi.fn(),
          retry,
        },
      ],
    });

    const retryButton = await screen.findByLabelText(/retry download of fight club/i);
    expect(screen.getByLabelText(/cancel download of fight club/i)).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalled();
  });

  it("cancels a running download through the context", async () => {
    const abort = vi.fn();
    function Harness() {
      const { registerDownload } = useDownloads();
      const [trigger, setTrigger] = useState(false);
      useEffect(() => {
        if (!trigger) return;
        registerDownload({ ...BASE_META, abort });
        setTrigger(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [trigger, registerDownload]);

      return (
        <>
          <button type="button" onClick={() => setTrigger(true)}>
            seed
          </button>
          <DownloadsPage />
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/downloads"]}>
        <DownloadsProvider>
          <Harness />
        </DownloadsProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /seed/i }));
    const cancel = await screen.findByLabelText(/cancel download of fight club/i);
    fireEvent.click(cancel);
    expect(abort).toHaveBeenCalled();
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });

  it("removes a finished download", async () => {
    renderPage({
      meta: BASE_META,
      flows: [{ status: "done", progress: { ratio: 1, bytesLabel: "10 MB" } }],
    });

    const remove = await screen.findByLabelText(/remove fight club from downloads/i);
    fireEvent.click(remove);
    await waitFor(() => expect(screen.queryByText("Fight Club")).not.toBeInTheDocument());
    expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument();
  });
});