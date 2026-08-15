export const initSpatialNavigation = () => {
  if (typeof window === 'undefined') return;

  const getFocusableElements = (): HTMLElement[] => {
    return Array.from(document.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), .movie-card'
    )).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && el.style.visibility !== 'hidden';
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    const activeElement = document.activeElement as HTMLElement;
    if (!activeElement || activeElement.tagName === 'INPUT') return;

    e.preventDefault();

    const elements = getFocusableElements();
    if (elements.length === 0) return;

    if (activeElement === document.body) {
      elements[0].focus();
      return;
    }

    const currentRect = activeElement.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2
    };

    let bestMatch: HTMLElement | null = null;
    let minDistance = Infinity;

    elements.forEach(el => {
      if (el === activeElement) return;

      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      
      let isCandidate = false;
      let distance = 0;

      switch (e.key) {
        case 'ArrowUp':
          if (dy < -10) { // Must be above
            isCandidate = true;
            distance = Math.abs(dy) * 1 + Math.abs(dx) * 2; // Penalize horizontal shift
          }
          break;
        case 'ArrowDown':
          if (dy > 10) { // Must be below
            isCandidate = true;
            distance = Math.abs(dy) * 1 + Math.abs(dx) * 2;
          }
          break;
        case 'ArrowLeft':
          if (dx < -10 && Math.abs(dy) < 50) { // Must be left and roughly same row
            isCandidate = true;
            distance = Math.abs(dx) + Math.abs(dy) * 5; 
          }
          break;
        case 'ArrowRight':
          if (dx > 10 && Math.abs(dy) < 50) { // Must be right and roughly same row
            isCandidate = true;
            distance = Math.abs(dx) + Math.abs(dy) * 5;
          }
          break;
      }

      if (isCandidate && distance < minDistance) {
        minDistance = distance;
        bestMatch = el;
      }
    });

    if (bestMatch) {
      (bestMatch as HTMLElement).focus();
      (bestMatch as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
};
