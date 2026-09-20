import { useRef, useLayoutEffect } from "react";

function SegmentControl({ options, value, onChange, label }) {
  const groupRef = useRef(null);
  const sliderRef = useRef(null);
  const btnRefs = useRef([]);

  const valueOf = (opt) => (typeof opt === "string" ? opt : opt.id);

  const positionSlider = () => {
    const group = groupRef.current;
    const slider = sliderRef.current;
    if (!group || !slider) return;
    const activeBtn = group.querySelector(".segment-btn.segment-active");
    if (!activeBtn) return;
    // Round to whole pixels so the pill never sits on a half-pixel seam.
    slider.style.left = `${Math.round(activeBtn.offsetLeft)}px`;
    slider.style.width = `${Math.round(activeBtn.offsetWidth)}px`;
  };

  // Cinejoy animated segment slider: the white/accent pill slides to the
  // active option instead of re-drawing each button background. Laid out
  // pre-paint so it never animates in from the left on mount, and kept in
  // sync with the group's real size via ResizeObserver (font load, resize,
  // label wrap).
  useLayoutEffect(() => {
    positionSlider();
    const group = groupRef.current;
    if (!group || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(positionSlider);
    observer.observe(group);
    return () => observer.disconnect();
  }, [value, options]);

  const activeIndex = options.findIndex((opt) => valueOf(opt) === value);

  // ARIA radiogroup contract: Arrow keys move selection (and focus), roving
  // tabindex keeps the group a single tab stop.
  const selectAndFocus = (index) => {
    const next = (index + options.length) % options.length;
    onChange(valueOf(options[next]));
    btnRefs.current[next]?.focus();
  };

  const handleKeyDown = (e) => {
    const current = activeIndex < 0 ? 0 : activeIndex;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      selectAndFocus(current + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      selectAndFocus(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      selectAndFocus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      selectAndFocus(options.length - 1);
    }
  };

  return (
    <div
      ref={groupRef}
      className="segment"
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      <div ref={sliderRef} className="segment-slider" aria-hidden="true" />
      {options.map((opt, i) => {
        const id = valueOf(opt);
        const name = typeof opt === "string" ? opt : opt.name;
        const active = value === id;
        return (
          <button
            key={id}
            ref={(el) => { btnRefs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            className={`segment-btn${active ? " segment-active" : ""}`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentControl;