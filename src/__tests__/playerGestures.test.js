import { describe, it, expect, vi } from 'vitest';

describe('Player Mobile Gestures & Visibility Contracts', () => {
  describe('Gesture sensitivity and non-compounding delta calculations', () => {
    const calcVolume = (startVolume, dy, height) => {
      const sensitivity = Math.max(220, height * 0.7);
      const delta = dy / sensitivity;
      return Math.max(0, Math.min(1, startVolume + delta));
    };

    const calcBrightness = (startBrightness, dy, height) => {
      const sensitivity = Math.max(220, height * 0.7);
      const delta = (dy / sensitivity) * 1.3;
      const newBright = Math.max(0.2, Math.min(1.5, startBrightness + delta));
      const normalizedValue = (newBright - 0.2) / 1.3;
      return { brightness: newBright, normalized: normalizedValue };
    };

    it('calculates volume linearly from startVolume without compounding', () => {
      const startVolume = 0.5;
      const height = 400; // sensitivity = 280

      // Move up 70px (+25% volume)
      const vol1 = calcVolume(startVolume, 70, height);
      expect(vol1).toBeCloseTo(0.75, 2);

      // Move up another 70px (dy = 140 from start) (+50% volume)
      const vol2 = calcVolume(startVolume, 140, height);
      expect(vol2).toBeCloseTo(1.0, 2);

      // Return to original touch position (dy = 0 from start)
      const volBack = calcVolume(startVolume, 0, height);
      expect(volBack).toBe(0.5);

      // Move down 70px (-25% volume)
      const volDown = calcVolume(startVolume, -70, height);
      expect(volDown).toBeCloseTo(0.25, 2);
    });

    it('clamps volume cleanly between 0 and 1', () => {
      const height = 300;
      expect(calcVolume(0.8, 500, height)).toBe(1);
      expect(calcVolume(0.2, -500, height)).toBe(0);
    });

    it('calculates brightness smoothly across 0.2 to 1.5 and normalizes to 0-1', () => {
      const startBrightness = 1.0;
      const height = 400;

      // Default normal brightness (1.0) maps to ~61.5%
      const normal = calcBrightness(startBrightness, 0, height);
      expect(normal.brightness).toBe(1.0);
      expect(normal.normalized).toBeCloseTo(0.615, 2);

      // Minimum clamped brightness (0.2) maps to 0%
      const min = calcBrightness(startBrightness, -500, height);
      expect(min.brightness).toBe(0.2);
      expect(min.normalized).toBe(0);

      // Maximum clamped brightness (1.5) maps to 100%
      const max = calcBrightness(startBrightness, 500, height);
      expect(max.brightness).toBe(1.5);
      expect(max.normalized).toBe(1);
    });

    it('enforces minimum sensitivity floor on small screens so short swipes do not jump 100%', () => {
      // In landscape phone, height might be 200px.
      // Math.max(220, 200 * 0.7) ensures sensitivity is at least 220px, not 140px.
      const height = 200;
      const volSmallSwipe = calcVolume(0.5, 22, height); // 22px swipe
      expect(volSmallSwipe).toBeCloseTo(0.6, 2); // only 10% change, not a sudden jump
    });
  });

  describe('Player Controls Visibility Contract', () => {
    const isControlsVisible = (showControls, isScrubbing, isLoading) => {
      return (showControls || isScrubbing) && !isLoading;
    };

    it('allows controls to be hidden when video is paused', () => {
      // User tapped to hide controls while paused
      const showControls = false;
      const isScrubbing = false;
      const isLoading = false;
      expect(isControlsVisible(showControls, isScrubbing, isLoading)).toBe(false);
    });

    it('shows controls when showControls is true while paused', () => {
      const showControls = true;
      const isScrubbing = false;
      const isLoading = false;
      expect(isControlsVisible(showControls, isScrubbing, isLoading)).toBe(true);
    });

    it('keeps controls visible while scrubbing even if showControls is false', () => {
      expect(isControlsVisible(false, true, false)).toBe(true);
    });

    it('hides controls while loading', () => {
      expect(isControlsVisible(true, false, true)).toBe(false);
    });
  });

  describe('Single-Tap Debounce vs Double-Tap Seek', () => {
    it('cancels pending single-tap toggle when double-tap occurs within 280ms', () => {
      vi.useFakeTimers();

      let singleTapFired = false;
      let doubleTapFired = false;
      let timer = null;
      let lastTapTime = 0;

      const handleTap = (now) => {
        const gap = now - lastTapTime;
        if (gap < 280 && gap > 0) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          lastTapTime = 0;
          doubleTapFired = true;
        } else {
          lastTapTime = now;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            singleTapFired = true;
            timer = null;
          }, 250);
        }
      };

      // Tap 1 at t = 1000
      handleTap(1000);
      expect(singleTapFired).toBe(false);
      expect(doubleTapFired).toBe(false);

      // Tap 2 at t = 1180 (gap 180ms < 280ms)
      handleTap(1180);
      expect(doubleTapFired).toBe(true);

      // Advance timers by 500ms
      vi.advanceTimersByTime(500);

      // Single-tap must NEVER have fired because double-tap cancelled it
      expect(singleTapFired).toBe(false);

      vi.useRealTimers();
    });

    it('fires single-tap toggle when no second tap arrives', () => {
      vi.useFakeTimers();

      let singleTapFired = false;
      let timer = null;
      let lastTapTime = 0;

      const handleTap = (now) => {
        const gap = now - lastTapTime;
        if (gap < 280 && gap > 0) {
          if (timer) clearTimeout(timer);
          lastTapTime = 0;
        } else {
          lastTapTime = now;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            singleTapFired = true;
            timer = null;
          }, 250);
        }
      };

      // Tap 1 at t = 1000
      handleTap(1000);
      expect(singleTapFired).toBe(false);

      // Advance time by 260ms
      vi.advanceTimersByTime(260);
      expect(singleTapFired).toBe(true);

      vi.useRealTimers();
    });
  });
});
