import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TransportBar from "../components/player/v2/TransportBar";
import { TRANSPORT_MODE } from "../components/player/v2/tiers";
import usePlayerControls from "../components/player/v2/hooks/usePlayerControls";
import { PreferencesProvider } from "../context/PreferencesContext";

/**
 * 5.7. The `seekTime` preference was validated to `[1,120]`, editable in
 * Settings, and read by NOTHING - `TransportBar` imported the `SKIP_SECONDS = 10`
 * constant instead of asking the parent. A viewer who set 30s watched the player
 * jump 10s on every press of the button they had just configured.
 *
 * The regression that matters is not "the label says 30"; it is that the CLICK
 * moves 30 seconds. Asserting only the label would pass while `onSkip` still
 * received 10, which is the shape of bug this file used to have.
 */
const onSkip = vi.fn();

const renderBar = (props = {}) =>
  render(
    <TransportBar
      title="Reacher"
      currentTime={0}
      duration={3600}
      onSkip={onSkip}
      onClose={vi.fn()}
      mode={TRANSPORT_MODE.ZONES}
      {...props}
    />,
  );

const backButton = () => screen.getByRole("button", { name: /Back \d+ seconds/ });
const forwardButton = () => screen.getByRole("button", { name: /Forward \d+ seconds/ });

describe("TransportBar skip amount is driven by the parent, not a constant", () => {
  beforeEach(() => onSkip.mockClear());

  it("defaults to 10s when no parent passes skipSeconds", () => {
    // A bare render must not produce "NaN seconds" in an accessible name.
    renderBar();
    expect(forwardButton().getAttribute("aria-label")).toBe("Forward 10 seconds");
  });

  it("labels the buttons with the skipSeconds it was given", () => {
    renderBar({ skipSeconds: 30 });
    expect(backButton().getAttribute("aria-label")).toBe("Back 30 seconds");
    expect(forwardButton().getAttribute("aria-label")).toBe("Forward 30 seconds");
  });

  it("MOVES by skipSeconds, which is the half that was actually broken", () => {
    // Mid-timeline so BOTH directions are enabled: back is correctly disabled at
    // currentTime 0, and a click there would prove nothing.
    renderBar({ currentTime: 100, skipSeconds: 30 });

    fireEvent.click(forwardButton());
    expect(onSkip).toHaveBeenCalledWith(30);

    fireEvent.click(backButton());
    expect(onSkip).toHaveBeenCalledWith(-30);
  });

  it("honours a 1s skip and a 120s skip - the validated bounds", () => {
    const { unmount } = renderBar({ currentTime: 100, skipSeconds: 1 });
    fireEvent.click(forwardButton());
    expect(onSkip).toHaveBeenLastCalledWith(1);
    unmount();

    onSkip.mockClear();
    renderBar({ currentTime: 100, skipSeconds: 120 });
    fireEvent.click(backButton());
    expect(onSkip).toHaveBeenLastCalledWith(-120);
  });

  it("disables forward at the end regardless of the skip amount", () => {
    // The boundary check is independent of skipSeconds; if it regressed, a
    // 120s skip from 30s of a 40s stream would sit there doing nothing.
    renderBar({ currentTime: 40, duration: 40, skipSeconds: 120 });
    expect(forwardButton().disabled).toBe(true);
    expect(backButton().disabled).toBe(false);
  });
});
/**
 * The half the TransportBar test cannot see: that the hook actually READS the
 * preference. The original defect was precisely a preference that was validated,
 * editable in Settings, persisted to `setting-seekTime` - and read by nothing.
 * A prop-level test would have passed throughout, because the prop was always
 * correct; nothing was passing it a value.
 */
describe("usePlayerControls reads the seekTime preference", () => {
  const wrapper = ({ children }) => <PreferencesProvider>{children}</PreferencesProvider>;
  const hook = () => renderHook(() => usePlayerControls({ current: null }, { current: null }, null), { wrapper });

  beforeEach(() => localStorage.clear());

  it("reports 10 when the viewer has never set one", () => {
    expect(hook().result.current.skipSeconds).toBe(10);
  });

  it("reports the stored value", () => {
    localStorage.setItem("setting-seekTime", "45");
    expect(hook().result.current.skipSeconds).toBe(45);
  });

  it("clamps a hand-edited value into the validated bounds", () => {
    // Not paranoia: the write path validates, but another tab or a human with a
    // devtools console does not, and an unclamped 100000s skip is a one-key
    // jump to the end of the film.
    localStorage.setItem("setting-seekTime", "100000");
    expect(hook().result.current.skipSeconds).toBe(120);

    localStorage.setItem("setting-seekTime", "-40");
    expect(hook().result.current.skipSeconds).toBe(1);
  });

  it("falls back to 10 when the stored value is not a number", () => {
    localStorage.setItem("setting-seekTime", JSON.stringify("thirty"));
    expect(hook().result.current.skipSeconds).toBe(10);
  });
});