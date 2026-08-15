import { useEffect } from 'react';

type HotkeyHandler = (e: KeyboardEvent) => void;

interface Hotkeys {
  [key: string]: HotkeyHandler;
}

export function useGlobalHotkeys(hotkeys: Hotkeys) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if the user is typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        // Exception: Escape should still work to blur inputs
        if (e.key === 'Escape' && hotkeys['Escape']) {
          (document.activeElement as HTMLElement).blur();
          hotkeys['Escape'](e);
        }
        return;
      }

      const handler = hotkeys[e.key] || hotkeys[e.key.toLowerCase()];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hotkeys]);
}
