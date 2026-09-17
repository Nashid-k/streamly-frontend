import { useState, useEffect } from "react";

/* Detect touch device: has touch screen + no hover = mobile/tablet */
const useIsTouch = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const noHover = window.matchMedia('(hover: none)').matches;
    setIsTouch(hasTouch && noHover);
  }, []);
  return isTouch;
};

export default useIsTouch;