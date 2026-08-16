
'use client';

import './MovieCard.css';
import React, { useState } from 'react';
import { Play, Plus, Check, Info, Film, Clock, ChevronDown, ThumbsUp } from 'lucide-react';
import { usePlatform } from './PlatformContext';
import { Movie } from '../types';
import { fetchMovieById } from '../lib/api';
import { HoverTrailer } from './HoverTrailer';
import { playHoverSound, playClickSound } from '../lib/audio';

interface MovieCardProps {
  movie: Movie;
  onPlay: (movie: Movie) => void;
  onOpenDetails: (movie: Movie) => void;
  onToggleMyList: (movieId: string) => void;
  isMyList: boolean;
  top10Rank?: number;
  /** When true the card is inside search results — click goes straight to playback */
  isSearchResult?: boolean;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  onPlay,
  onOpenDetails,
  onToggleMyList,
  isMyList,
  top10Rank,
  isSearchResult = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const { platform } = usePlatform();
  
  // Image logic: Prime/Netflix prefer landscape, Hotstar prefers portrait
  const preferPortrait = platform === 'hotstar' || top10Rank !== undefined;
  const primaryImg = preferPortrait ? (movie.posterUrl || movie.backdropUrl) : (movie.backdropUrl || movie.posterUrl);
  const fallbackImg = preferPortrait ? (movie.backdropUrl || movie.posterUrl) : (movie.posterUrl || movie.backdropUrl);

  let imgSrc = primaryImg;
  if (imgFailed || !imgSrc) {
    imgSrc = fallbackImg && fallbackImg !== primaryImg ? fallbackImg : 'broken';
  }

  const handleCardClick = () => {
    playClickSound();
    onOpenDetails(movie);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };


  const renderPlatformLogo = (label: string) => {
    if (label === 'Netflix') {
      return <img key="Netflix" src="https://assets.nflxext.com/ffe/siteui/common/icons/nficon2016.ico" title="Available on Netflix" className="moviecard-elem-f52360" style={{objectFit: 'contain', padding: '2px'}} />;
    }
    if (label === 'Prime Video') {
      return <img key="Prime Video" src="https://www.primevideo.com/favicon.ico" title="Available on Prime Video" className="moviecard-elem-115c67" style={{objectFit: 'contain', padding: '2px'}} />;
    }
    if (label === 'Hotstar') {
      return <img key="Hotstar" src="https://secure-media.hotstar.com/web-assets/prod/jhs_favicon.ico" title="Available on Disney+ Hotstar" className="moviecard-elem-cf56c6" style={{objectFit: 'contain', padding: '2px'}} />;
    }
    return null;
  };

  const renderProgressBar = () => {
    if (movie.watchProgress === undefined) return null;
    return (
      <div className="moviecard-elem-23d72f">
        <div style={{ width: `${Math.max(5, Math.min(100, movie.watchProgress * 100))}%`, height: '100%', background: platform === 'nprime' ? '#00A8E1' : platform === 'hotstar' ? '#1F80E0' : '#E50914' }} />
      </div>
    );
  };

  const platformBadges = movie.availablePlatforms && movie.availablePlatforms.length > 0 ? (
    <div className="moviecard-elem-82a5b2">
      {movie.availablePlatforms.map((label) => renderPlatformLogo(label))}
    </div>
  ) : null;

  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (!isHovered) playHoverSound();
    setIsHovered(true);
    if (movie.id) {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        setShowTrailer(true);
        fetchMovieById(movie.id).catch(() => {});
      }, 1500);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xPct = x / rect.width - 0.5;
    const yPct = y / rect.height - 0.5;
    setMousePos({ x: xPct, y: yPct });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setShowTrailer(false);
    setMousePos({ x: 0, y: 0 });
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const parallaxStyle = isHovered 
    ? { transform: `scale(1.05) rotateX(${-mousePos.y * 15}deg) rotateY(${mousePos.x * 15}deg)`, zIndex: 50 } 
    : { transform: 'scale(1) rotateX(0deg) rotateY(0deg)', zIndex: 1 };

  const matchScore = movie.matchScore || (parseInt(movie.id.replace(/\D/g, '') || '0') % 30 + 70);
  const rawScore = movie.score || (matchScore / 10);
  const ratingText = rawScore.toFixed(1);

  const imdbBadge = (
    <div style={{
      position: 'absolute', bottom: '8px', left: '8px', zIndex: 15,
      background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px',
      display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: 800, color: '#fff',
      boxShadow: '0 2px 6px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      opacity: isHovered ? 0 : 1, transition: 'opacity 0.2s',
    }}>
      <span className="moviecard-elem-fc373e">IMDb</span>
      <span>{ratingText}</span>
    </div>
  );

  // ── HOTSTAR CARD (Vertical Poster with Netflix-style Hover Expansion) ──
  if (platform === 'hotstar') {
    return (
      <div
        className={`movie-card hotstar-card ${top10Rank !== undefined ? 'top10' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`View details for ${movie.title}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          flexShrink: 0,
          width: '185px',
          height: '275px',
          borderRadius: '12px',
          cursor: 'pointer',
          zIndex: isHovered ? 50 : 1,
          transition: `z-index 0s ${isHovered ? '0s' : '0.4s'}`,
          overflow: 'visible', // Break out of bounds like Netflix
        }}
      >
        <div className="hotstar-card-inner"
          onMouseMove={handleMouseMove}
          ref={cardRef}
          style={{
            position: 'absolute',
            top: 0, left: 0, width: '100%',
            background: '#0F1014',
            borderRadius: '12px',
            boxShadow: isHovered ? '0 12px 32px rgba(0,0,0,0.85), 0 0 16px rgba(31, 128, 224, 0.6)' : '0 4px 14px rgba(0,0,0,0.5)',
            border: isHovered ? '2px solid rgba(31, 128, 224, 0.9)' : '1px solid rgba(255,255,255,0.05)',
            transform: isHovered ? `scale(1.25) rotateX(${-mousePos.y * 15}deg) rotateY(${mousePos.x * 15}deg)` : 'scale(1)',
            transformOrigin: 'center center',
            transition: `transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.45s ease, border 0.35s ease, z-index 0s ${isHovered ? '0s' : '0.45s'}`,
            zIndex: isHovered ? 50 : 1,
          }}
        >
          {!isImageLoaded && imgSrc && imgSrc !== 'broken' && (
            <div style={{
              position: 'absolute', inset: 0,
              animation: 'netflixSkeletonPulse 1.5s infinite ease-in-out',
              zIndex: 0,
              pointerEvents: 'none',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 'inherit'
            }} />
          )}
          {imgSrc && imgSrc !== 'broken' ? (
            <img
              src={imgSrc}
              alt={movie.title}
              loading="lazy"
              decoding="async"
              onLoad={() => setIsImageLoaded(true)}
              onError={() => { 
                if (!imgFailed && fallbackImg && fallbackImg !== primaryImg) {
                  setImgFailed(true); 
                } else {
                  setIsImageLoaded(true); 
                }
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '2/3', borderRadius: isHovered ? '10px 10px 0 0' : '10px', opacity: isImageLoaded ? 1 : 0 }}
            />
          ) : imgSrc === 'broken' ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', textAlign: 'center', padding: '10px', aspectRatio: '2/3' }}>
               <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#888' }}>{movie.title}</span>
            </div>
          ) : (
            <div className="moviecard-elem-8b9f5c" style={{ aspectRatio: '2/3' }}>
              <Film size={28} color="#1F80E0" className="moviecard-elem-03bd55" />
              <span className="moviecard-elem-3d2a25">{movie.title}</span>
            </div>
          )}
          {showTrailer && movie.trailerUrl && (
            <HoverTrailer trailerUrl={movie.trailerUrl} isMuted={true} />
          )}
          {imdbBadge}
          {movie.isRecentlyAdded && !movie.isUpcoming && !movie.isLeavingSoon && (
            <div className="moviecard-elem-66f313">NEW</div>
          )}
          {movie.isLeavingSoon && (
            <div className="moviecard-elem-4c27d4">LEAVING SOON</div>
          )}
          {movie.isUpcoming && (
            <div className="moviecard-elem-4e41c2">COMING SOON</div>
          )}
          
          <div className="expanding-meta" style={{
            padding: '14px',
            opacity: isHovered ? 1 : 0,
            visibility: isHovered ? 'visible' : 'hidden',
            transition: 'opacity 0.4s ease, visibility 0.4s',
            backgroundColor: '#0F1014',
            borderRadius: '0 0 10px 10px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#8f98b0', fontWeight: 600 }}>
              <span>{movie.duration || '2023'}</span>
              <span>•</span>
              <span>{movie.genres?.[0] || (movie.isSeries ? 'Series' : 'Movie')}</span>
            </div>
            
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              {(!movie.availablePlatforms || movie.availablePlatforms.includes('Hotstar')) && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onPlay(movie); }}
                  style={{ flex: 1, background: '#FFF', color: '#0F1014', border: 'none', borderRadius: '4px', padding: '8px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#e5e5e5'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#FFF'}
                >
                  <Play size={14} fill="#0F1014" /> Watch Now
                </button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleMyList(movie.id); }}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              >
                {isMyList ? <Check size={16} color="#FFF" /> : <Plus size={16} color="#FFF" />}
              </button>
            </div>
          </div>
          {platformBadges}
          {!isHovered && renderProgressBar()}
        </div>
      </div>
    );
  }

  // ── PRIME VIDEO CARD (Landscape Card with Electric Blue Ring & Quick Actions) ──
  if (platform === 'nprime') {
    const nprimeWidth = top10Rank !== undefined ? 190 : 280;
    const nprimeHeight = top10Rank !== undefined ? 280 : 158;
    return (
      <div
        className={`movie-card nprime-card ${top10Rank !== undefined ? 'top10' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`View details for ${movie.title}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          flexShrink: 0,
          width: `${nprimeWidth}px`,
          height: `${nprimeHeight}px`,
          borderRadius: '6px',
          cursor: 'pointer',
          zIndex: isHovered ? 50 : 1,
          transition: `z-index 0s ${isHovered ? '0s' : '0.4s'}`,
          overflow: 'visible', // Break out of bounds like Netflix
        }}
      >
        <div className="nprime-card-inner"
          onMouseMove={handleMouseMove}
          ref={cardRef}
          style={{
            position: 'absolute',
            top: 0, left: 0, width: '100%',
            background: '#0F171E',
            borderRadius: '6px',
            boxShadow: isHovered ? '0 12px 30px rgba(0,0,0,0.95), 0 0 20px rgba(0, 168, 225, 0.6)' : '0 4px 12px rgba(0,0,0,0.6)',
            border: isHovered ? '2px solid #00A8E1' : '1px solid rgba(255,255,255,0.06)',
            transform: isHovered ? `scale(1.25) rotateX(${-mousePos.y * 15}deg) rotateY(${mousePos.x * 15}deg)` : 'scale(1)',
            transformOrigin: 'center center',
            transition: `transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.45s ease, border 0.35s ease, z-index 0s ${isHovered ? '0s' : '0.45s'}`,
            zIndex: isHovered ? 50 : 1,
          }}
        >
          {!isImageLoaded && imgSrc && imgSrc !== 'broken' && (
            <div style={{
              position: 'absolute', inset: 0,
              animation: 'netflixSkeletonPulse 1.5s infinite ease-in-out',
              zIndex: 0,
              pointerEvents: 'none',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 'inherit'
            }} />
          )}
          {imgSrc && imgSrc !== 'broken' ? (
            <img
              src={imgSrc}
              alt={movie.title}
              loading="lazy"
              decoding="async"
              onLoad={() => setIsImageLoaded(true)}
              onError={() => { 
                if (!imgFailed && fallbackImg && fallbackImg !== primaryImg) {
                  setImgFailed(true); 
                } else {
                  setIsImageLoaded(true); 
                }
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isImageLoaded ? 1 : 0, transition: 'transform 0.4s ease', aspectRatio: top10Rank !== undefined ? '2/3' : '16/9', borderRadius: isHovered ? '6px 6px 0 0' : '6px' }}
            />
          ) : imgSrc === 'broken' ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', textAlign: 'center', padding: '10px', aspectRatio: top10Rank !== undefined ? '2/3' : '16/9' }}>
               <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#888' }}>{movie.title}</span>
            </div>
          ) : (
            <div className="moviecard-elem-54e2d7" style={{ aspectRatio: top10Rank !== undefined ? '2/3' : '16/9' }}>
              <Film size={24} color="#00A8E1" className="moviecard-elem-fc7b7c" />
              <span className="moviecard-elem-1fa588">{movie.title}</span>
            </div>
          )}
          {showTrailer && movie.trailerUrl && (
            <HoverTrailer trailerUrl={movie.trailerUrl} isMuted={true} />
          )}
          {imdbBadge}
          <div style={{ position: 'absolute', top: 0, left: 0, background: '#00A8E1', color: '#FFF', padding: '4px 6px', borderBottomRightRadius: '4px', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '2px', zIndex: 10, borderTopLeftRadius: '6px' }}>
            <Check size={12} strokeWidth={4} color="#00A8E1" style={{ background: '#FFF', borderRadius: '50%', padding: '1px' }} /> prime
          </div>
          {movie.isRecentlyAdded && !movie.isUpcoming && !movie.isLeavingSoon && (
            <div className="moviecard-elem-d1c52f">NEWLY ADDED</div>
          )}
          {movie.isLeavingSoon && (
            <div className="moviecard-elem-756e29">LEAVING PRIME</div>
          )}
          {movie.isUpcoming && (
            <div className="moviecard-elem-73fae6">COMING SOON</div>
          )}
          
          <div className="expanding-meta" style={{
            padding: '12px',
            opacity: isHovered ? 1 : 0,
            visibility: isHovered ? 'visible' : 'hidden',
            transition: 'opacity 0.4s ease, visibility 0.4s',
            backgroundColor: '#0F171E',
            borderRadius: '0 0 6px 6px',
            width: '100%',
          }}>
            <h4 className="moviecard-elem-d88b98">{movie.title}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              {(!movie.availablePlatforms || movie.availablePlatforms.includes('Prime Video')) && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onPlay(movie); }}
                  style={{ background: '#00A8E1', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s', paddingLeft: '2px' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#0f79af'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#00A8E1'}
                >
                  <Play size={16} fill="#FFF" color="#FFF" />
                </button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleMyList(movie.id); }}
                style={{ background: 'transparent', border: '2px solid rgba(255,255,255,0.7)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', color: '#FFF' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'transparent'; }}
              >
                {isMyList ? <Check size={16} /> : <Plus size={16} />}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onOpenDetails(movie); }}
                style={{ background: 'transparent', border: '2px solid rgba(255,255,255,0.7)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', color: '#FFF' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <Info size={16} />
              </button>
            </div>
          </div>
          {platformBadges}
          {!isHovered && renderProgressBar()}
        </div>
      </div>
    );
  }

  // ── NETFLIX CARD (Landscape, Expanding Dropdown) ──
  const netflixWidth = top10Rank !== undefined ? 200 : 290;
  const netflixHeight = top10Rank !== undefined ? 300 : 163;
  
  return (
    <div
      className={`movie-card netflix-card ${top10Rank !== undefined ? 'top10' : ''}`}
      role="button"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: `${netflixWidth}px`,
        height: top10Rank !== undefined ? '300px' : '163px',
        borderRadius: '4px',
        cursor: 'pointer',
        zIndex: isHovered ? 50 : 1,
        transition: `z-index 0s ${isHovered ? '0s' : '0.4s'}`,
        // When hovered, the card breaks out of overflow to show the dropdown
        overflow: 'visible',
      }}
    >
        <div className="netflix-card-inner" 
          onMouseMove={handleMouseMove}
          ref={cardRef}
          style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%',
          background: '#141414',
          borderRadius: '4px',
          boxShadow: isHovered ? '0 20px 40px rgba(0,0,0,0.95), 0 10px 20px rgba(0,0,0,0.7)' : 'none',
          transform: isHovered ? `scale(1.25) rotateX(${-mousePos.y * 15}deg) rotateY(${mousePos.x * 15}deg)` : 'scale(1)',
        transformOrigin: 'center center',
        transition: `transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.45s ease, z-index 0s ${isHovered ? '0s' : '0.45s'}`,
        zIndex: isHovered ? 50 : 1,
      }}>
        {/* Netflix N Logo */}
        {parseInt(movie.id.replace(/\D/g, '') || '0') % 3 === 0 && (
          <div className="moviecard-elem-afc72d">
            <img src="https://upload.wikimedia.org/wikipedia/commons/1/18/Netflix_2016_N_logo.svg" alt="N" className="moviecard-elem-8ce510" />
          </div>
        )}
        {/* Netflix Authentic Badges */}
        {movie.isRecentlyAdded && !movie.isUpcoming && !movie.isLeavingSoon && (
          <div className="moviecard-elem-1886ac">
            NEW
          </div>
        )}
        {movie.isLeavingSoon && (
          <div className="moviecard-elem-c2de51">
            LEAVING SOON
          </div>
        )}
        {movie.isUpcoming && (
          <div className="moviecard-elem-1f0f68">
            COMING SOON
          </div>
        )}
        {!isImageLoaded && imgSrc && imgSrc !== 'broken' && (
          <div style={{
            position: 'absolute', inset: 0,
            animation: 'netflixSkeletonPulse 1.5s infinite ease-in-out',
            zIndex: 0,
            pointerEvents: 'none',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 'inherit'
          }} />
        )}
        {imgSrc && imgSrc !== 'broken' ? (
          <img
            className="netflix-card-img"
            src={imgSrc}
            alt={movie.title}
            onLoad={() => setIsImageLoaded(true)}
            onError={() => { 
              if (!imgFailed && fallbackImg && fallbackImg !== primaryImg) {
                setImgFailed(true); 
              } else {
                setIsImageLoaded(true); 
              }
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: top10Rank !== undefined ? '2/3' : '16/9', borderRadius: isHovered ? '4px 4px 0 0' : '4px', opacity: isImageLoaded ? 1 : 0 }}
          />
        ) : imgSrc === 'broken' ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', textAlign: 'center', padding: '10px' }}>
             <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#888' }}>{movie.title}</span>
          </div>
) : (
          <div style={{ width: '100%', height: '100%', aspectRatio: top10Rank !== undefined ? '2/3' : '16/9', background: 'linear-gradient(135deg, #1f1f1f 0%, #111111 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px', textAlign: 'center', borderRadius: '4px' }}>
            <Film size={24} color="#E50914" className="moviecard-elem-4398e5" />
            <span className="moviecard-elem-458a1e">{movie.title}</span>
          </div>
        )}
        {showTrailer && movie.trailerUrl && (
          <HoverTrailer trailerUrl={movie.trailerUrl} isMuted={true} />
        )}
        
        {/* Title / Logo over image on Hover */}
        {isHovered && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, height: `${netflixHeight}px`,
            background: 'linear-gradient(to top, rgba(20,20,20,0.95) 0%, transparent 45%)',
            pointerEvents: 'none',
            borderRadius: '4px 4px 0 0',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '12px'
          }}>
            {movie.logoUrl ? (
               <img src={movie.logoUrl} alt={movie.title} className="moviecard-elem-8d581f" />
             ) : (
               <h4 className="moviecard-elem-a01151">{movie.title}</h4>
             )}
          </div>
        )}
        
        {imdbBadge}
        {/* Expanding Metadata Box (Below Image) */}
        <div className="expanding-meta" style={{
          padding: '12px',
          opacity: isHovered ? 1 : 0,
          visibility: isHovered ? 'visible' : 'hidden',
          transition: 'opacity 0.4s ease, visibility 0.4s',
          backgroundColor: '#141414',
          borderRadius: '0 0 4px 4px',
          width: '100%',
        }}>
          {/* Action Row */}
          <div className="moviecard-elem-464823">
            <div className="moviecard-elem-b82f88">
              {(!movie.availablePlatforms || movie.availablePlatforms.includes('Netflix')) && (
                <button className="moviecard-elem-68038c" onClick={(e) => { e.stopPropagation(); onPlay(movie); }}>
                  <Play size={12} fill="#000" color="#000" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleMyList(movie.id); }}
                className="moviecard-elem-8b8a17"
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; e.currentTarget.style.background = 'none'; }}
              >
                {isMyList ? <Check size={18} /> : <Plus size={18} />}
              </button>
              <button className="moviecard-elem-dec26d" onClick={(e) => { e.stopPropagation(); }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; e.currentTarget.style.background = 'none'; }}>
                <ThumbsUp size={18} />
              </button>
            </div>
            <button className="moviecard-elem-0ea5e5" onClick={(e) => { e.stopPropagation(); onOpenDetails(movie); }}>
              <ChevronDown size={14} />
            </button>
          </div>
          {/* Info Row */}
          <div className="moviecard-elem-0e6893">
            <span className="moviecard-elem-9789d2">{movie.matchScore}% Match</span>
            <span className="moviecard-elem-3d8c01">{movie.maturityRating || 'U/A 13+'}</span>
            <span className="moviecard-elem-32f859">{movie.duration || (movie.isSeries ? 'Series' : 'Film')}</span>
            <span className="moviecard-elem-ab2d5b">HD</span>
          </div>
          {/* Genre Row */}
          <div className="moviecard-elem-23ca87">
            {movie.genres.slice(0, 3).join(' • ')}
          </div>
        </div>
        {/* Platform Availability Badges */}
        {platformBadges}
        {!isHovered && renderProgressBar()}
      </div>
    </div>
  );
};
