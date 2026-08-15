'use client';

import React, { useEffect, useState } from 'react';
import { Play, X, Plus, Check, Info, Loader } from 'lucide-react';
import { Movie } from '../types';
import { fetchMovieById } from '../lib/api';

interface TrailerModalProps {
  movie: Movie;
  onPlay: (movie: Movie) => void;
  onClose: () => void;
  onOpenDetails: (movie: Movie) => void;
  onToggleMyList: (movieId: string) => void;
  isMyList: boolean;
}

export const TrailerModal: React.FC<TrailerModalProps> = ({
  movie: initialMovie,
  onPlay,
  onClose,
  onOpenDetails,
  onToggleMyList,
  isMyList,
}) => {
  // Start with the card data, then enrich with full detail (which includes trailerUrl)
  const [movie, setMovie] = useState<Movie>(initialMovie);
  const [loading, setLoading] = useState(!initialMovie.trailerUrl);
  const [trailerError, setTrailerError] = useState(false);
  const [trailerIndex, setTrailerIndex] = useState(0);

  // Reset all local state whenever a different title opens, then fetch its
  // enriched metadata. Without this reset a quick title change can briefly
  // display the previous title's trailer.
  useEffect(() => {
    let isMounted = true;
    setMovie(initialMovie);
    setTrailerError(false);
    if (initialMovie.trailerUrl) {
      setLoading(false);
      return () => { isMounted = false; };
    }
    setLoading(true);
    fetchMovieById(initialMovie.id)
      .then((enriched) => {
        if (isMounted) {
          setMovie(enriched);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [initialMovie.id, initialMovie.trailerUrl]);

  // Escape key + body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Normalise to embed URL just in case watch-URL slips through
  const toEmbed = (url: string): string => {
    if (!url) return '';
    if (url.includes('/embed/')) return url;
    const match = url.match(/[?&]v=([^&]+)/);
    if (match) return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
    return url;
  };

  let decodedTrailerUrl = '';
  let allTrailers = movie.sources?.filter(s => s.name.toLowerCase().includes('trailer') || s.type === 'trailer') || [];

  if (allTrailers.length > trailerIndex) {
    const encodedUrl = allTrailers[trailerIndex].url;
    if (encodedUrl && typeof window !== 'undefined') {
      try {
        const decodedBase64 = atob(encodedUrl);
        const xorKey = 42;
        decodedTrailerUrl = decodedBase64.split('').map(char => String.fromCharCode(char.charCodeAt(0) ^ xorKey)).join('');
      } catch {
        decodedTrailerUrl = '';
      }
    }
  } else if (typeof window !== 'undefined' && movie.trailerUrl) {
    try {
      const decodedBase64 = atob(movie.trailerUrl);
      const xorKey = 42;
      decodedTrailerUrl = decodedBase64.split('').map(char => String.fromCharCode(char.charCodeAt(0) ^ xorKey)).join('');
      allTrailers = [{ name: 'Trailer 1', url: movie.trailerUrl, type: 'trailer' }];
    } catch {
      decodedTrailerUrl = '';
    }
  }
  const embedUrl = decodedTrailerUrl ? toEmbed(decodedTrailerUrl) : '';
  const hasTrailer = !!embedUrl && !trailerError;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(14px)',
        // Keep every part of this dialog above the fixed navigation/profile UI.
        zIndex: 4000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.2s ease',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${movie.title} trailer`}
    >
      {/* Close */}
      <button
        className="modal-close trailer-close"
        onClick={onClose}
        style={{
          position: 'absolute', top: '20px', right: '24px',
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#FFF', width: '40px', height: '40px',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', backdropFilter: 'blur(8px)', zIndex: 10, transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary-glow-strong)'; e.currentTarget.style.borderColor = 'var(--primary-color)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
        aria-label="Close trailer"
      >
        <X size={18} />
      </button>

      {/* Content container */}
      <div className="trailer-dialog" style={{ width: '100%', maxWidth: '900px', animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>

        {/* Video / Backdrop area */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            paddingBottom: hasTrailer ? '56.25%' : '0',
            height: hasTrailer ? '0' : '360px',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#000',
            boxShadow: '0 40px 100px rgba(0,0,0,0.9)',
          }}
        >
          {loading ? (
            /* Loading state — show backdrop with spinner */
            <div
              style={{
                position: hasTrailer ? 'absolute' : 'static',
                width: '100%', height: hasTrailer ? '100%' : '360px',
                backgroundImage: movie.backdropUrl
                  ? `linear-gradient(135deg, rgba(0,0,0,0.8), rgba(0,0,0,0.4)), url(${movie.backdropUrl || movie.posterUrl})`
                  : 'linear-gradient(135deg, var(--bg-elevated), var(--bg-color))',
                backgroundSize: 'cover', backgroundPosition: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px',
              }}
            >
              <Loader size={36} color="var(--primary-color)" style={{ animation: 'netflixSpin 1s linear infinite' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: 600 }}>Loading trailer…</span>
            </div>
          ) : hasTrailer ? (
            <iframe
              src={embedUrl}
              title={`${movie.title} Trailer`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onError={() => setTrailerError(true)}
            />
          ) : (
            /* No trailer fallback */
            <div
              style={{
                width: '100%', height: '100%',
                backgroundImage: movie.backdropUrl
                  ? `linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%), url(${movie.backdropUrl})`
                  : 'linear-gradient(135deg, #1E293B, #0F172A)',
                backgroundSize: 'cover', backgroundPosition: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px',
              }}
            >
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                <Play fill="#FFF" size={28} style={{ marginLeft: '4px' }} />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: 600 }}>No trailer available</span>
            </div>
          )}
        </div>
        
        {/* Trailer Switcher */}
        {allTrailers.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', padding: '12px 0', overflowX: 'auto' }}>
            {allTrailers.map((t, idx) => (
              <button
                key={t.url}
                onClick={() => { setTrailerIndex(idx); setLoading(true); setTrailerError(false); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: trailerIndex === idx ? '1px solid var(--primary-color)' : '1px solid rgba(255,255,255,0.2)',
                  background: trailerIndex === idx ? 'rgba(229,9,20,0.2)' : 'rgba(255,255,255,0.05)',
                  color: trailerIndex === idx ? '#fff' : 'rgba(255,255,255,0.7)',
                  fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap'
                }}
              >
                {t.name || `Trailer ${idx + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Info row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '20px',
            marginTop: '20px',
            flexWrap: 'wrap',
          }}
        >
          {/* Left: title + meta */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            {movie.isUpcoming && (
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-color)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
                Coming Soon · {movie.releaseDate || ''}
              </div>
            )}
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFF', margin: '0 0 6px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {movie.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <span style={{ color: '#46d369', fontWeight: 700, fontSize: '0.85rem' }}>{movie.matchScore}% Match</span>
              <span style={{ color: '#AAA', fontSize: '0.82rem' }}>{movie.releaseYear}</span>
              <span style={{ border: '1px solid rgba(255,255,255,0.3)', padding: '1px 6px', fontSize: '0.72rem', color: '#CCC', borderRadius: '2px' }}>{movie.maturityRating}</span>
              <span style={{ color: '#AAA', fontSize: '0.82rem' }}>{movie.duration}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {movie.genres.slice(0, 3).map((g) => (
                <span key={g} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 9px', fontSize: '0.72rem', color: '#BBB', fontWeight: 600 }}>
                  {g}
                </span>
              ))}
            </div>
            <p style={{ fontSize: '0.85rem', color: '#AAA', lineHeight: 1.55, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {movie.description}
            </p>
          </div>

          {/* Right: action buttons */}
          <div className="trailer-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '180px', flexShrink: 0 }}>
            {!movie.isUpcoming && (
              <button
                onClick={() => onPlay(movie)}
                style={{
                  backgroundColor: '#FFF', color: '#000',
                  border: 'none', borderRadius: '6px',
                  padding: '12px 22px', fontSize: '0.92rem', fontWeight: 800,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 4px 18px rgba(255,255,255,0.15)', transition: 'transform 0.15s, box-shadow 0.15s',
                  letterSpacing: '-0.01em',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(255,255,255,0.25)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(255,255,255,0.15)'; }}
              >
                <Play fill="#000" size={17} /> Stream Now
              </button>
            )}

            <button
              onClick={() => onToggleMyList(movie.id)}
              style={{
                backgroundColor: isMyList ? 'var(--primary-border)' : 'rgba(255,255,255,0.1)',
                color: '#FFF', border: isMyList ? '1px solid var(--primary-glow-strong)' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px', padding: '11px 22px', fontSize: '0.88rem', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                backdropFilter: 'blur(6px)', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isMyList ? 'var(--primary-faded)' : 'rgba(255,255,255,0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isMyList ? 'var(--primary-border)' : 'rgba(255,255,255,0.1)'; }}
            >
              {isMyList ? <><Check size={16} /> In My List</> : <><Plus size={16} /> Add to My List</>}
            </button>

            <button
              onClick={() => { onClose(); setTimeout(() => onOpenDetails(movie), 50); }}
              style={{
                backgroundColor: 'transparent', color: '#AAA',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                padding: '10px 22px', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#FFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#AAA'; }}
            >
              <Info size={15} /> More Info
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
