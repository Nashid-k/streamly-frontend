'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, AlertTriangle, SkipForward, ChevronDown, ChevronUp } from 'lucide-react';
import { Movie } from '../types';

interface VideoPlayerModalProps {
  movie: Movie;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ movie, onClose }) => {
  const [playerMovie, setPlayerMovie] = useState(movie);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [sourceFailed, setSourceFailed] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState('');
  const [showUI, setShowUI] = useState(true);
  const [showServerList, setShowServerList] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeMovie = playerMovie || movie;
  const allSources = activeMovie.sources || [];
  const currentSource = allSources[sourceIndex] || allSources[0];

  // Decode the XOR-encoded source URL
  const decodeSourceUrl = (encodedUrl: string): string => {
    if (!encodedUrl) return '';
    try {
      const secret = process.env.NEXT_PUBLIC_URL_ENCRYPTION_KEY || 'STREAMLY_SECURE';
      const b64 = atob(encodedUrl);
      return b64.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ secret.charCodeAt(i % secret.length))).join('');
    } catch {
      return '';
    }
  };

  const currentUrl = typeof window !== 'undefined'
    ? decodeSourceUrl(currentSource?.url || '')
    : '';

  useEffect(() => {
    setPlayerMovie(movie);
    
    let initialIndex = 0;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('preferredServerIndex');
      if (saved !== null) {
        initialIndex = parseInt(saved, 10);
      }
    }
    const maxSources = movie?.sources?.length || 1;
    if (initialIndex >= maxSources) initialIndex = 0;
    
    setSourceIndex(initialIndex);
    setSourceFailed(false);
    setSourceLoading(true);
    setSourceError('');
  }, [movie]);

  const resetHide = () => {
    if (showServerList) return;
    setShowUI(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowUI(false);
    }, 3500);
  };

  useEffect(() => {
    resetHide();
    const handleBlur = () => setShowUI(true);
    window.addEventListener('blur', handleBlur);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (showServerList) {
      setShowUI(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
  }, [showServerList]);

  if (!activeMovie) return null;

  const chooseSource = (idx: number) => {
    setSourceIndex(idx);
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferredServerIndex', idx.toString());
    }
    setSourceFailed(false);
    setSourceLoading(true);
    setSourceError('');
    setShowServerList(false);
  };

  const nextEpisode = activeMovie.nextEpisode;
  const playNextEpisode = () => {
    if (!nextEpisode) return;
    setPlayerMovie({
      ...activeMovie,
      sources: nextEpisode.sources || activeMovie.sources,
      nextEpisode: undefined,
      title: `${activeMovie.title.split(' · ')[0]} · S${nextEpisode.seasonNumber}E${nextEpisode.episodeNumber} — ${nextEpisode.title}`,
    });
    setSourceFailed(false);
    setSourceLoading(true);
    setSourceError('');
  };

  const floatingTransition = {
    opacity: showUI ? 1 : 0,
    pointerEvents: (showUI ? 'auto' : 'none') as React.CSSProperties['pointerEvents'],
    transition: 'opacity 0.3s ease',
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${activeMovie.title} playback`}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      onClick={(e) => {
        resetHide();
        if (e.target === overlayRef.current) {
          setShowServerList(false);
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: '#000',
        overflow: 'hidden',
        cursor: showUI ? 'default' : 'none',
      }}
    >
      {currentUrl && !sourceFailed ? (
        <iframe
          key={`${activeMovie.id}-s${sourceIndex}`}
          src={currentUrl}
          title={`${activeMovie.title} — ${currentSource?.name}`}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            border: 'none', display: 'block', zIndex: 1,
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
          onLoad={() => { setSourceLoading(false); setSourceFailed(false); setSourceError(''); }}
          onError={() => {
            setSourceLoading(false);
            setSourceFailed(true);
            setSourceError(`${currentSource?.name} could not load.`);
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px 24px', textAlign: 'center',
          background: 'radial-gradient(ellipse at center, rgba(22,22,22,0.98) 0%, #000 100%)', color: '#fff',
        }}>
          <AlertTriangle size={34} style={{ color: 'var(--primary-color)', marginBottom: '6px' }} />
          <h2 style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', margin: '0 0 6px', maxWidth: '500px' }}>
            {activeMovie.title}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.86rem', maxWidth: '420px', lineHeight: 1.65 }}>
            {sourceError || `${currentSource?.name ?? 'This server'} could not start playback.`}
          </p>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '520px' }}>
            {allSources.map((s, i) => (
              <button key={s.name} onClick={() => chooseSource(i)} style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '0.76rem', fontWeight: 700,
                border: i === sourceIndex ? '1px solid var(--primary-color)' : '1px solid rgba(255,255,255,0.2)',
                background: i === sourceIndex ? 'rgba(229,9,20,0.3)' : 'rgba(255,255,255,0.07)',
                color: i === sourceIndex ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
              }}>{s.name}</button>
            ))}
          </div>
          <button onClick={onClose} style={{
            marginTop: '18px', padding: '9px 22px', borderRadius: '6px', background: 'rgba(255,255,255,0.09)',
            border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
          }}>← Back to Browsing</button>
        </div>
      )}

      {/* Floating UI */}
      <>
        <div style={{
          position: 'absolute', top: '16px', left: '16px', zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '10px', ...floatingTransition,
        }}>
          {nextEpisode && !sourceLoading && !sourceFailed && (
            <button
              onClick={(e) => { e.stopPropagation(); playNextEpisode(); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '6px',
                background: 'rgba(229,9,20,0.85)', color: '#fff',
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: 'none',
              }}
            >
              <SkipForward size={13} fill="currentColor" /> Next
            </button>
          )}
        </div>

        <div
          style={{
            position: 'absolute', top: '16px', right: '16px', zIndex: 20,
            display: 'flex', alignItems: 'center', gap: '8px', ...floatingTransition,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowServerList((p) => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '7px 13px', borderRadius: '8px',
                background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {currentSource ? `Server ${sourceIndex + 1}` : 'Server'} {showServerList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showServerList && (
              <>
                <div 
                  style={{ position: 'fixed', inset: 0, zIndex: 399 }} 
                  onClick={(e) => { e.stopPropagation(); setShowServerList(false); }} 
                />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'rgba(10,10,10,0.97)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '8px 0', minWidth: '180px', zIndex: 400,
                }}>
                  {allSources.map((s, i) => (
                    <div key={s.name} onClick={() => chooseSource(i)} style={{
                      padding: '9px 14px', cursor: 'pointer', fontSize: '0.82rem',
                      color: i === sourceIndex ? '#fff' : 'rgba(255,255,255,0.6)',
                      background: i === sourceIndex ? 'rgba(229,9,20,0.18)' : 'transparent',
                    }}>
                      {`Server ${i + 1}`}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.75)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={17} />
          </button>
        </div>
      </>
    </div>
  );
};
