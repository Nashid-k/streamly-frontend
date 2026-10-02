import { beforeEach, describe, expect, it } from "vitest";
import { lockScroll } from "../utils/scrollLock";

/* Cooperative body scroll lock (task.md 5.24).
 *
 * The bug this replaces: six overlays each saved and restored
 * `document.body.style.overflow` independently, so whichever closed LAST won.
 * Open a modal then the player, close the player first, and the modal's close
 * later restored the value it had captured before the player existed — often
 * unlocking the page under a still-open overlay. The lock now lives on a
 * shared count: locked while anyone holds it, restored when the last does.
 */

beforeEach(() => {
  document.body.style.overflow = "";
});

describe("lockScroll (task.md 5.24)", () => {
  it("locks on the first owner and restores the exact prior value on release", () => {
    document.body.style.overflow = "clip";
    const release = lockScroll();

    expect(document.body.style.overflow).toBe("hidden");
    release();

    expect(document.body.style.overflow).toBe("clip");
  });

  it("keeps the page locked until the LAST owner releases", () => {
    const releaseModal = lockScroll();
    const releasePlayer = lockScroll();
    expect(document.body.style.overflow).toBe("hidden");

    releaseModal();
    expect(document.body.style.overflow).toBe("hidden");

    releasePlayer();
    expect(document.body.style.overflow).toBe("");
  });

  it("treats a repeated release as a no-op", () => {
    const releaseA = lockScroll();
    const releaseB = lockScroll();

    releaseA();
    releaseA();

    expect(document.body.style.overflow).toBe("hidden");

    releaseB();
    expect(document.body.style.overflow).toBe("");
  });
});
