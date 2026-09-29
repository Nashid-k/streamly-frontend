import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyTextToClipboard } from "../utils/clipboard";

/* The copy-public-link path is only as honest as this primitive: it must
   report success ONLY when a clipboard path actually accepted the text, so a
   blocked clipboard can never be toasted as "Copied!". */

describe("copyTextToClipboard", () => {
  let writeText;

  beforeEach(() => {
    writeText = undefined;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => writeText,
    });
    document.execCommand = vi.fn(() => true);
  });

  afterEach(() => {
    delete document.execCommand;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => undefined,
    });
    vi.restoreAllMocks();
  });

  it("uses the async Clipboard API and reports success", async () => {
    writeText = { writeText: vi.fn().mockResolvedValue(undefined) };

    await expect(copyTextToClipboard("https://x/c/abc", "test")).resolves.toBe(true);
    expect(writeText.writeText).toHaveBeenCalledWith("https://x/c/abc");
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it("falls back to execCommand when the Clipboard API rejects", async () => {
    writeText = {
      writeText: vi.fn().mockRejectedValue(new Error("permission denied")),
    };

    await expect(copyTextToClipboard("fallback", "test")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back when the Clipboard API is unavailable (insecure context)", async () => {
    writeText = undefined;

    await expect(copyTextToClipboard("legacy", "test")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when no path works — never a false success", async () => {
    writeText = undefined;
    document.execCommand = vi.fn(() => false);

    await expect(copyTextToClipboard("doomed", "test")).resolves.toBe(false);
  });

  it("returns false and throws nothing when execCommand is unsupported", async () => {
    writeText = undefined;
    delete document.execCommand;

    await expect(copyTextToClipboard("nope", "test")).resolves.toBe(false);
  });

  it("rejects empty input instead of copying a blank line", async () => {
    writeText = { writeText: vi.fn() };

    await expect(copyTextToClipboard("", "test")).resolves.toBe(false);
    await expect(copyTextToClipboard(undefined, "test")).resolves.toBe(false);
    expect(writeText.writeText).not.toHaveBeenCalled();
  });

  it("does not leave the fallback textarea in the document", async () => {
    writeText = undefined;
    const before = document.body.innerHTML;

    await copyTextToClipboard("cleanup", "test");
    expect(document.body.innerHTML).toBe(before);
  });
});
