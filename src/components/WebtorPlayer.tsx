import React, { useEffect, useState } from 'react';

interface WebtorPlayerProps {
  webtorUrl: string; // e.g. "webtor:Avengers Endgame|2019"
  onLoaded: () => void;
  onError: (msg: string) => void;
}

export const WebtorPlayer: React.FC<WebtorPlayerProps> = ({ webtorUrl, onLoaded, onError }) => {
  const [magnet, setMagnet] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const fetchMagnet = async () => {
      try {
        const payload = webtorUrl.replace('webtor:', '');
        const [title, year] = payload.split('|');
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://streamly-backend-9q7i.onrender.com';
        const res = await fetch(`${baseUrl}/api/movies/magnet?title=${encodeURIComponent(title)}&year=${year}`);
        const data = await res.json();
        
        if (!data.magnet) {
          throw new Error('No seeds or torrent found');
        }
        
        if (isMounted) {
          setMagnet(data.magnet);
        }
      } catch (e: any) {
        if (isMounted) onError(e.message || 'Failed to fetch torrent metadata');
      }
    };
    
    fetchMagnet();
    return () => { isMounted = false; };
  }, [webtorUrl, onError]);

  useEffect(() => {
    if (!magnet) return;

    // Load Webtor script
    const scriptId = 'webtor-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdn.jsdelivr.net/npm/@webtor/player-sdk-js/dist/index.min.js';
      script.async = true;
      document.body.appendChild(script);
    }

    const initWebtor = () => {
      onLoaded();
      // @ts-ignore
      window.webtor = window.webtor || [];
      // @ts-ignore
      window.webtor.push({
        id: 'webtor-player-container',
        magnet: magnet,
        width: '100%',
        height: '100%',
        features: {
          title: false,
          p2pProgress: true
        }
      });
    };

    if (script.getAttribute('data-loaded') === 'true') {
      initWebtor();
    } else {
      script.addEventListener('load', () => {
        script.setAttribute('data-loaded', 'true');
        initWebtor();
      });
    }

    return () => {
      const container = document.getElementById('webtor-player-container');
      if (container) container.innerHTML = '';
    };
  }, [magnet, onLoaded]);

  return (
    <div 
      id="webtor-player-container" 
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, backgroundColor: '#000' }} 
    />
  );
};
