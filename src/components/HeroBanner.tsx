'use client';

import './HeroBanner.css';
import React, { useState, useEffect } from 'react';
import { Play, Info, Clock, Check, Plus, Volume2, VolumeX } from 'lucide-react';
import { usePlatform } from './PlatformContext';
import { Movie } from '../types';
import { fetchMovieById } from '../lib/api';

interface HeroBannerProps {
  movie: Movie | null;
  carouselMovies?: Movie[];
  activeCarouselIndex?: number;
  onSelectCarouselIndex?: (index: number) => void;
  onPlay: (movie: Movie) => void;
  onOpenDetails: (movie: Movie) => void;
  onToggleMyList?: (movieId: string) => void;
  isMyList?: boolean;
  onHeroReady?: () => void;
  onThemeColorChange?: (color: string | null) => void;
}

const getFallbackTitleStyle = () => {
  return {
    fontSize: 'clamp(1.8rem, 6vw, 4rem)',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 800,
    color: '#FFFFFF',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.02em',
    textShadow: '2px 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)',
    lineHeight: 1.1,
  };
};

const decodeTrailerUrl = (encodedUrl: string): string => {
  if (!encodedUrl) return '';
  try {
    return atob(encodedUrl);
  } catch (e) {
    return encodedUrl;
  }
};

function useTrailerPlayer(encodedUrl: string) {
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [showIframe, setShowIframe] = useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const trailerUrl = encodedUrl ? decodeTrailerUrl(encodedUrl) : '';
  const videoIdMatch = trailerUrl.match(/embed\/([^?]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : '';

  useEffect(() => {
    setIsVideoPlaying(false);
    setShowIframe(false);
    if (!videoId) return;

    const timer = setTimeout(() => {
      setShowIframe(true);
    }, 2500); // 2.5 second delay before cinematic autoplay
    return () => clearTimeout(timer);
  }, [videoId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com') return;
      if (iframeRef.current && iframeRef.current.contentWindow !== event.source) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const isPlayingEvent = (data.event === 'infoDelivery' && data.info && data.info.playerState === 1) || 
                               (data.event === 'onStateChange' && data.info === 1);

        if (isPlayingEvent) {
          setIsVideoPlaying(true);
        }
      } catch (e) {}
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: newMuted ? 'mute' : 'unMute', args: [] }),
        '*'
      );
    }
  };

  const handleIframeLoad = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
    }
  };

  const renderTrailer = () => (
    videoId && showIframe ? (
      <iframe
        ref={iframeRef}
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&showinfo=0&rel=0&modestbranding=1&loop=1&playlist=${videoId}&enablejsapi=1`}
        title="Cinematic Trailer"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100%',
          height: '150%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          opacity: isVideoPlaying ? 1 : 0,
          transition: 'opacity 1s ease-in-out',
          zIndex: 0,
        }}
        onLoad={handleIframeLoad}
      />
    ) : null
  );

  return { isMuted, toggleMute, renderTrailer, hasTrailer: !!videoId, isVideoPlaying };
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ 
  movie, 
  carouselMovies = [], 
  activeCarouselIndex = 0, 
  onSelectCarouselIndex, 
  onPlay, 
  onOpenDetails, 
  onToggleMyList, 
  isMyList, 
  onHeroReady,
  onThemeColorChange
}) => {
  const { platform } = usePlatform();
  const [enrichedMovie, setEnrichedMovie] = useState<Movie | null>(null);
  const [carouselScrollIndex, setCarouselScrollIndex] = useState(0);
  const [isLogoLoading, setIsLogoLoading] = useState(true);
  const [isLogoImageLoaded, setIsLogoImageLoaded] = useState(false);

  // Persistent logo cache across banner transitions to eliminate text title flicker
  const logoCacheRef = React.useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!movie) { if (onHeroReady) onHeroReady(); return; }

    let isMounted = true;

    // Preload logos eagerly for all candidate movies in the carousel so switching has 0ms logo delay
    if (carouselMovies && carouselMovies.length > 0) {
      Promise.allSettled(
        carouselMovies.map(async (c) => {
          if (!c.logoUrl && c.id && !logoCacheRef.current.has(c.id)) {
            try {
              const fetched = await fetchMovieById(c.id);
              if (fetched?.logoUrl) {
                c.logoUrl = fetched.logoUrl;
                logoCacheRef.current.set(c.id, fetched.logoUrl);
                if (isMounted && movie.id === c.id) {
                  setEnrichedMovie((curr) => (curr?.id === c.id ? { ...curr, logoUrl: fetched.logoUrl } : curr));
                }
              }
            } catch (e) {}
          } else if (c.logoUrl && c.id) {
            logoCacheRef.current.set(c.id, c.logoUrl);
          }
        })
      );
    }

    if (onThemeColorChange && movie.backdropUrl) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        requestAnimationFrame(() => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 10; canvas.height = 10;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, 10, 10);
              const data = ctx.getImageData(0, 0, 10, 10).data;
              let r = 0, g = 0, b = 0;
              for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
              const count = data.length / 4;
              onThemeColorChange(`rgba(${Math.floor(r/count)}, ${Math.floor(g/count)}, ${Math.floor(b/count)}, 0.35)`);
            }
          } catch (e) {
            onThemeColorChange(null);
          }
        });
      };
      img.onerror = () => onThemeColorChange(null);
      img.src = movie.backdropUrl;
    } else if (onThemeColorChange) {
      onThemeColorChange(null);
    }

    // Check if we already cached the logoUrl for this movie
    const cachedLogo = movie.logoUrl || logoCacheRef.current.get(movie.id);
    const initialMovie = cachedLogo ? { ...movie, logoUrl: cachedLogo } : movie;

    setEnrichedMovie(initialMovie);
    setIsLogoImageLoaded(false);
    if (onHeroReady) onHeroReady();

    // Async background enrichment if logo is missing (non-blocking)
    if (!initialMovie.logoUrl) {
      setIsLogoLoading(true);
      fetchMovieById(movie.id)
        .then((fetched) => {
          if (isMounted && fetched) {
            if (fetched.logoUrl) logoCacheRef.current.set(movie.id, fetched.logoUrl);
            setEnrichedMovie((curr) => (curr?.id === movie.id ? { ...curr, ...fetched, logoUrl: fetched.logoUrl || curr.logoUrl } : curr));
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setIsLogoLoading(false);
        });
    } else {
      setIsLogoLoading(false);
    }
    return () => { 
      isMounted = false; 
    };
  }, [movie, carouselMovies, onHeroReady]);

  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const { renderTrailer, isVideoPlaying, toggleMute, isMuted, hasTrailer } = useTrailerPlayer(enrichedMovie?.trailerUrl || '');

  if (!enrichedMovie) return null;

  const backgroundUrl = enrichedMovie.backdropUrl || enrichedMovie.posterUrl || '';

  const parallaxTransform = `translate3d(0, ${scrollY * 0.3}px, 0) scale(${1 + scrollY * 0.0005})`;
  const opacityFade = Math.max(0, 1 - scrollY / 600);

  return (
    <div className="hero-container herobanner-elem-749d84"
      data-testid="hero-container"
      style={{ transform: parallaxTransform, opacity: opacityFade, willChange: 'transform, opacity' }}
    >
      {/* Cinematic Trailer Background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        {renderTrailer()}
      </div>
      {/* High-Resolution Backdrop Image (Desktop/Tablet) */}
      <div
        key={`backdrop-${enrichedMovie.id}`}
        className="hero-backdrop hero-backdrop-animate"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: enrichedMovie.backdropUrl
            ? platform === 'hotstar'
              ? `linear-gradient(90deg, rgba(15,16,20,0.8) 0%, rgba(15,16,20,0) 75%), url(${enrichedMovie.backdropUrl})`
              : platform === 'nprime'
              ? `linear-gradient(180deg, rgba(15,23,30,0.5) 0%, rgba(15,23,30,0.2) 50%, rgba(15,23,30,1) 100%), linear-gradient(90deg, rgba(15,23,30,0.95) 0%, rgba(15,23,30,0) 65%), url(${enrichedMovie.backdropUrl})`
              : `linear-gradient(180deg, rgba(20,20,20,0.5) 0%, rgba(20,20,20,0.2) 50%, rgba(20,20,20,1) 100%), linear-gradient(90deg, rgba(20,20,20,0.85) 0%, rgba(20,20,20,0) 65%), url(${enrichedMovie.backdropUrl})`
            : 'linear-gradient(135deg, var(--bg-color) 0%, var(--bg-elevated) 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          zIndex: 0,
          opacity: isVideoPlaying ? 0 : 1,
          transition: 'opacity 1s ease-in-out',
          WebkitMaskImage: platform === 'hotstar' 
            ? 'linear-gradient(to top, transparent 0%, black 40%), linear-gradient(to right, transparent 0%, black 40%)' 
            : 'none',
          WebkitMaskComposite: platform === 'hotstar' ? 'source-in' : 'source-over',
          maskComposite: platform === 'hotstar' ? 'intersect' : 'add',
        }}
      />
      
      {/* Portrait Poster Image (Mobile Native View) */}
      <div
        key={`poster-${enrichedMovie.id}`}
        className="hero-portrait-poster"
        style={{
          display: 'none', // Shown via CSS on mobile
          position: 'absolute',
          inset: 0,
          backgroundImage: enrichedMovie.posterUrl 
            ? platform === 'hotstar'
              ? `linear-gradient(180deg, rgba(15,16,20,0) 0%, rgba(15,16,20,0.2) 50%, rgba(15,16,20,0.8) 100%), url(${enrichedMovie.posterUrl})`
              : platform === 'nprime'
              ? `linear-gradient(180deg, rgba(15,23,30,0) 50%, rgba(15,23,30,0.8) 80%, rgba(15,23,30,1) 100%), url(${enrichedMovie.posterUrl})`
              : `linear-gradient(180deg, rgba(20,20,20,0) 50%, rgba(20,20,20,0.8) 80%, rgba(20,20,20,1) 100%), url(${enrichedMovie.posterUrl})`
            : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          zIndex: 0,
          WebkitMaskImage: platform === 'hotstar'
            ? 'linear-gradient(to top, transparent 0%, black 40%), linear-gradient(to right, transparent 0%, black 40%)'
            : 'none',
          WebkitMaskComposite: platform === 'hotstar' ? 'source-in' : 'source-over',
          maskComposite: platform === 'hotstar' ? 'intersect' : 'add',
        }}
      />

      {/* Left Column: Hero Content */}
      <div className="hero-content hero-text-animate herobanner-elem-023ba0" key={enrichedMovie.id} data-testid="hero-content">
        {/* Upcoming Eyebrow Badge */}
        {enrichedMovie.isUpcoming && (
          <div className="herobanner-elem-93662c">
            <Clock size={16} /> COMING SOON TO {platform === 'hotstar' ? 'HOTSTAR' : platform === 'nprime' ? 'PRIME' : 'NETFLIX'}
          </div>
        )}

        {/* Nflix Original N Eyebrow */}
        {platform === 'nflix' && parseInt(enrichedMovie.id.replace(/\D/g, '') || '0') % 3 === 0 && !enrichedMovie.isUpcoming && (
          <div className="herobanner-elem-f28965">
            <img src="https://upload.wikimedia.org/wikipedia/commons/1/18/Netflix_2016_N_logo.svg" alt="N" className="herobanner-elem-b5c0b1" />
            <span className="herobanner-elem-03b192">
              {enrichedMovie.isSeries ? 'Series' : 'Film'}
            </span>
          </div>
        )}

        {/* Title Logo / Stylized Title Text (Always visible, seamless logo swap) */}
        <div className="herobanner-elem-37a56f" style={{ position: 'relative' }}>
          {enrichedMovie.logoUrl && (
            <img
              key={`logo-${enrichedMovie.id}`}
              src={enrichedMovie.logoUrl}
              alt=""
              onLoad={() => setIsLogoImageLoaded(true)}
              className="herobanner-elem-227255"
              style={{ opacity: isLogoImageLoaded ? 1 : 0, transition: 'opacity 0.4s ease', position: isLogoImageLoaded ? 'relative' : 'absolute' }}
            />
          )}
          
          {(!enrichedMovie.logoUrl && isLogoLoading) || (enrichedMovie.logoUrl && !isLogoImageLoaded) ? (
            <div className="herobanner-elem-1e1dae" />
          ) : !enrichedMovie.logoUrl && !isLogoLoading ? (
            <h1
              className="hero-title-text herobanner-elem-7244b5"
              data-testid="hero-title"
              style={getFallbackTitleStyle()}
            >
              {enrichedMovie.title}
            </h1>
          ) : null}
        </div>

        {/* Badges */}
        <div className="hero-meta-row herobanner-elem-09425b">
          {enrichedMovie.isUpcoming ? (
            <span className="herobanner-elem-bf0d83">
              {enrichedMovie.releaseDate ? `Releasing ${enrichedMovie.releaseDate}` : 'Coming Soon'}
            </span>
          ) : (
            <span style={{ color: platform === 'hotstar' ? '#1F80E0' : platform === 'nprime' ? '#00A8E1' : '#46d369', fontWeight: 700, fontSize: '1rem' }}>
              {enrichedMovie.matchScore}% Match
            </span>
          )}
          <span className="herobanner-elem-da6646">{enrichedMovie.releaseYear}</span>
          <span className="herobanner-elem-9cce30">
            {enrichedMovie.maturityRating}
          </span>
          <span className="herobanner-elem-851fc5">{enrichedMovie.duration}</span>
          
          {/* Authentic High-Tech Badges (4K, HDR, Atmos) */}
          <span className="herobanner-elem-7c982f">
            4K UHD
          </span>
          <span className="herobanner-elem-d2597d">
            {platform === 'nprime' ? 'HDR10+' : 'VISION'}
          </span>
          <span className="herobanner-elem-90f9cb">
            ATMOS
          </span>
          {platform === 'nflix' && (
            <span className="herobanner-elem-593142">
              5.1
            </span>
          )}
        </div>

        {/* Description */}
        <p className="hero-description herobanner-elem-98ab02"
        >
          {enrichedMovie.description}
        </p>

        {/* Action Buttons */}
        <div className="hero-actions-row herobanner-elem-bc5904">
          <button
            className="primary-play-btn"
            onClick={() => onPlay(enrichedMovie)}
            style={{
              background: platform === 'hotstar' ? 'var(--primary-color)' : '#FFF',
              color: platform === 'hotstar' ? '#FFF' : '#000',
              fontWeight: 800,
              fontSize: '1rem',
              padding: (platform === 'nprime' || platform === 'hotstar') ? '12px 28px' : '10px 24px',
              borderRadius: platform === 'hotstar' ? '8px' : (platform === 'nprime' ? '50px' : '4px'),
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: platform === 'hotstar' ? '0 4px 14px var(--primary-glow)' : '0 4px 14px rgba(0,0,0,0.5)',
              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
          >
            <Play fill={platform === 'hotstar' ? '#FFF' : '#000'} size={18} />
            {platform === 'hotstar' ? 'Watch Now' : 'Play'}
          </button>
          
          {platform !== 'hotstar' && (
          <button
            onClick={() => onOpenDetails(enrichedMovie)}
            style={{
              background: platform === 'nprime' ? 'rgba(255,255,255,0.15)' : 'rgba(109, 109, 110, 0.7)',
              color: '#FFF',
              fontWeight: 700,
              fontSize: '1rem',
              padding: platform === 'nprime' ? '0' : '10px 24px',
              width: platform === 'nprime' ? '48px' : 'auto',
              height: platform === 'nprime' ? '48px' : 'auto',
              borderRadius: platform === 'nprime' ? '50%' : '4px',
              border: platform === 'nprime' ? '1px solid rgba(255,255,255,0.4)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.background = platform === 'nprime' ? 'rgba(255,255,255,0.25)' : 'rgba(129, 129, 130, 0.9)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = platform === 'nprime' ? 'rgba(255,255,255,0.15)' : 'rgba(109, 109, 110, 0.7)'; }}
          >
            <Info size={platform === 'nprime' ? 22 : 18} /> {platform !== 'nprime' && 'More Info'}
          </button>
          )}
          
          {(platform === 'nprime' || platform === 'hotstar') && onToggleMyList && (
            <button
              onClick={() => onToggleMyList(enrichedMovie.id)}
              style={{
                height: platform === 'nprime' ? '48px' : (platform === 'hotstar' ? '48px' : '44px'),
                padding: platform === 'hotstar' ? '0 24px' : '0',
                width: platform === 'hotstar' ? 'auto' : (platform === 'nprime' ? '48px' : '44px'),
                borderRadius: platform === 'hotstar' ? '8px' : '50%',
                backgroundColor: 'rgba(255,255,255,0.15)',
                border: platform === 'hotstar' ? 'none' : '1px solid rgba(255,255,255,0.4)',
                color: '#FFF', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                cursor: 'pointer', 
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                fontWeight: 700,
                fontSize: '1rem',
                backdropFilter: 'blur(8px)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
            >
              {isMyList ? <Check size={platform === 'hotstar' ? 20 : 24} /> : <Plus size={platform === 'hotstar' ? 20 : 24} />}
              {platform === 'hotstar' && <span>Watchlist</span>}
            </button>
          )}
          
          {hasTrailer && isVideoPlaying && (
            <button
              onClick={toggleMute}
              style={{
                height: platform === 'nprime' ? '48px' : '44px',
                width: platform === 'nprime' ? '48px' : '44px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.4)',
                color: '#FFF', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                cursor: 'pointer', 
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                backdropFilter: 'blur(8px)',
                marginLeft: 'auto'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          )}

        </div>
      </div>

      {/* Hotstar Specific Hero Carousel 5-Visible Thumbnail Bar with Scroll Arrows */}
      {platform === 'hotstar' && carouselMovies.length > 1 && (
        <div className="hero-carousel-bar herobanner-elem-e8da64">
          {/* Scroll Left Arrow */}
          {carouselScrollIndex > 0 && (
            <button
              onClick={() => setCarouselScrollIndex(i => Math.max(0, i - 1))}
              className="herobanner-elem-c301d7"
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(15, 16, 20, 0.75)'; }}
            >
              ❮
            </button>
          )}

          {/* 5 Visible Thumbnails Window */}
          <div className="herobanner-elem-3cb1f2">
            {carouselMovies.slice(carouselScrollIndex, carouselScrollIndex + 5).map((item, localIdx) => {
              const realIdx = carouselScrollIndex + localIdx;
              const isActive = realIdx === activeCarouselIndex;
              const thumbUrl = item.backdropUrl || item.posterUrl;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectCarouselIndex && onSelectCarouselIndex(realIdx)}
                  style={{
                    width: '102px',
                    height: '58px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    position: 'relative',
                    border: isActive ? '2px solid #FFF' : '2px solid transparent',
                    boxShadow: isActive ? '0 8px 24px rgba(0,0,0,0.85), 0 0 14px rgba(255,255,255,0.6)' : '0 4px 12px rgba(0,0,0,0.6)',
                    transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    transform: isActive ? 'scale(1.14)' : 'scale(1)',
                    opacity: isActive ? 1 : 0.65,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.transform = isActive ? 'scale(1.18)' : 'scale(1.08)';
                    e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.9), 0 0 16px rgba(255,255,255,0.8)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = isActive ? '1' : '0.65';
                    e.currentTarget.style.transform = isActive ? 'scale(1.14)' : 'scale(1)';
                    e.currentTarget.style.boxShadow = isActive ? '0 8px 24px rgba(0,0,0,0.85), 0 0 14px rgba(255,255,255,0.6)' : '0 4px 12px rgba(0,0,0,0.6)';
                  }}
                >
                  <img
                    src={thumbUrl}
                    alt={item.title}
                    className="herobanner-elem-28b9d9"
                  />
                  {isActive && (
                    <div className="herobanner-elem-d7f8d1" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Scroll Right Arrow */}
          {carouselScrollIndex < Math.max(0, carouselMovies.length - 5) && (
            <button
              onClick={() => setCarouselScrollIndex(i => Math.min(carouselMovies.length - 5, i + 1))}
              className="herobanner-elem-a23959"
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(15, 16, 20, 0.75)'; }}
            >
              ❯
            </button>
          )}
        </div>
      )}

      {/* Right Edge: Maturity Rating Tag (Netflix only) */}
      {platform === 'nflix' && (
        <div
          className="herobanner-elem-eab72e"
        >
          <div
            className="herobanner-elem-8201f7"
          >
            {enrichedMovie.maturityRating}
          </div>
        </div>
      )}
    </div>
  );
};
