import { useState, useEffect } from "react";

/* Observe the player container size → derive a live HUD scale factor so
   the top-center HUDs stay proportional from phones to 4K monitors. */
const useContainerSize = (ref) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
};

export default useContainerSize;