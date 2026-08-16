'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, Play, Plus, Check, ThumbsUp, ThumbsDown, Share2, ArrowLeft, ChevronDown, Volume2, VolumeX, Download, Sparkles } from 'lucide-react';
import { usePlatform } from './PlatformContext';
import { Navbar } from './Navbar';
import { Movie, Episode } from '../types';
import { fetchMovieById, fetchSeasonEpisodes, fetchRecommendationsApi } from '../lib/api';
import { FastAverageColor } from 'fast-average-color';

interface MovieDetailModalProps {
  movie: Movie | null;
  onClose: () => void;
  onPlay: (movie: Movie, episode?: Episode) => void;
  onOpenDetails: (movie: Movie) => void;
  onToggleMyList: (movieId: string) => void;
  isMyList: boolean;
  similarMovies: Movie[];
}

function useDominantColor(imageUrl: string | undefined, defaultColor: string) {
  const [color, setColor] = useState(defaultColor);
  
  useEffect(() => {
    if (!imageUrl) return;
    const fac = new FastAverageColor();
    fac.getColorAsync(imageUrl, { ignoredColor: [0,0,0,255], crossOrigin: 'anonymous' })
      .then(color => {
        setColor(color.rgba);
      })
      .catch(e => {
        console.log(e);
      });
  }, [imageUrl]);
  
  return color;
}

function formatCastNames(castList?: any[]): string {
  if (!castList || !Array.isArray(castList) || castList.length === 0) return '';
  const names = castList.map((item) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean);
  return names.slice(0, 5).join(', ') + (names.length > 5 ? ', ...' : '');
}

function renderPlatformBadges(availablePlatforms?: string[]) {
  if (!availablePlatforms || availablePlatforms.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
      {availablePlatforms.map((label) => {
        if (label === 'Netflix') return <img key="Netflix" src="https://assets.nflxext.com/ffe/siteui/common/icons/nficon2016.ico" title="Available on Netflix" style={{width: '26px', height: '26px', borderRadius: '4px', objectFit: 'contain', background: '#000', padding: '2px', boxShadow: '0 2px 8px rgba(0,0,0,0.8)'}} />;
        if (label === 'Prime Video') return <img key="Prime Video" src="https://www.primevideo.com/favicon.ico" title="Available on Prime Video" style={{width: '26px', height: '26px', borderRadius: '4px', objectFit: 'contain', background: '#000', padding: '2px', boxShadow: '0 2px 8px rgba(0,0,0,0.8)'}} />;
        if (label === 'Hotstar') return <img key="Hotstar" src="https://secure-media.hotstar.com/web-assets/prod/jhs_favicon.ico" title="Available on Disney+ Hotstar" style={{width: '26px', height: '26px', borderRadius: '4px', objectFit: 'contain', background: '#000', padding: '2px', boxShadow: '0 2px 8px rgba(0,0,0,0.8)'}} />;
        return null;
      })}
    </div>
  );
}

function useMovieDetails(movie: Movie | null, selectedSeason: number, platform: string) {
  const [detailedMovie, setDetailedMovie] = useState<Movie | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(true);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState<boolean>(true);
  const seasonsCache = useRef<Record<number, Episode[]>>({});

  useEffect(() => {
    let isMounted = true;
    if (!movie) return;
    setIsLoadingDetails(true);
    
    // Fetch full movie details
    const fetchPlatform = platform;
    fetchMovieById(movie.id, fetchPlatform)
      .then(data => { 
        if (isMounted) {
          setDetailedMovie(data);
        } 
      })
      .catch(() => { if (isMounted) setDetailedMovie(movie); })
      .finally(() => { if (isMounted) setIsLoadingDetails(false); });

    return () => { isMounted = false; };
  }, [movie, platform]);
  
  useEffect(() => {
    let isMounted = true;
    if (!movie) return;
    
    const isTvShow = Boolean(movie.isSeries || movie.id?.includes('-tv-') || movie.seasonsCount);
    if (!isTvShow) {
      setEpisodes([]);
      setIsLoadingEpisodes(false);
      return;
    }
    
    if (seasonsCache.current[selectedSeason]) {
      setEpisodes(seasonsCache.current[selectedSeason]);
      setIsLoadingEpisodes(false);
      return;
    }
    
    setIsLoadingEpisodes(true);
    const fetchPlatform = platform;
    fetchSeasonEpisodes(movie.id, selectedSeason, fetchPlatform)
      .then(data => { 
        if (isMounted) {
          const epData = Array.isArray(data) ? data : [];
          seasonsCache.current[selectedSeason] = epData;
          setEpisodes(epData); 
        } 
      })
      .catch(() => { if (isMounted) setEpisodes([]); })
      .finally(() => { if (isMounted) setIsLoadingEpisodes(false); });

    return () => { isMounted = false; };
  }, [movie, selectedSeason]);

  return { detailedMovie, episodes, isLoadingDetails, isLoadingEpisodes };
}

const EpisodeSkeleton = () => (
  <div className="episode-skeleton">
    <div className="episode-skeleton-img" />
    <div className="episode-skeleton-info">
      <div className="episode-skeleton-title" />
      <div className="episode-skeleton-desc" />
      <div className="episode-skeleton-meta" />
    </div>
  </div>
);

const decodeTrailerUrl = (encodedUrl: string): string => {
  if (!encodedUrl) return '';
  try {
    const b64 = atob(encodedUrl);
    return b64.split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 42)).join('');
  } catch {
    return '';
  }
};

function useTrailerPlayer(encodedUrl: string, backdropUrl: string, delayMs: number = 0) {
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [shouldLoadIframe, setShouldLoadIframe] = useState(delayMs === 0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const trailerUrl = encodedUrl ? decodeTrailerUrl(encodedUrl) : '';
  const videoIdMatch = trailerUrl.match(/embed\/([^?]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : '';

  useEffect(() => {
    setIsVideoPlaying(false);
    if (delayMs > 0) {
      setShouldLoadIframe(false);
      const timer = setTimeout(() => setShouldLoadIframe(true), delayMs);
      return () => clearTimeout(timer);
    } else {
      setShouldLoadIframe(true);
    }
  }, [videoId, delayMs]);

  // Fallback: force reveal the video after it has had time to load
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (shouldLoadIframe && videoId) {
      timeout = setTimeout(() => {
        setIsVideoPlaying(true);
      }, 2000);
    }
    return () => clearTimeout(timeout);
  }, [shouldLoadIframe, videoId]);

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
          // If the user previously unmuted, enforce it on the new trailer automatically!
          if (!isMuted && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
              '*'
            );
          }
        }
      } catch (e) {}
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isMuted]);

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
    <>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: '#111', zIndex: 1 }} />
      <img 
        src={backdropUrl} 
        style={{ 
          width: '100%', height: '100%', objectFit: 'cover', 
          position: 'absolute', inset: 0, zIndex: 10,
          opacity: isVideoPlaying && videoId ? 0 : 1, transition: 'opacity 0.8s ease'
        }} 
      />
      {shouldLoadIframe && videoId && (
        <iframe
          ref={iframeRef}
          onLoad={handleIframeLoad}
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&iv_load_policy=3&enablejsapi=1&playsinline=1`}
          style={{ 
            width: '150%', height: '150%', position: 'absolute', top: '-25%', left: '-25%', border: 'none', 
            pointerEvents: 'none', zIndex: 5, opacity: isVideoPlaying ? 1 : 0, transition: 'opacity 0.8s ease'
          }}
          allow="autoplay; encrypted-media"
        />
      )}
    </>
  );

  return { isMuted, toggleMute, renderTrailer, hasTrailer: !!videoId };
}

function SwitchingLoader({ targetPlatform }: { targetPlatform: string }) {
  const logo = targetPlatform === 'Netflix' ? 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg' 
             : targetPlatform === 'Prime Video' ? 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Prime_Video.png' 
             : 'https://secure-media.hotstarext.com/web-assets/prod/images/brand-logos/disney-hotstar-logo-dark.svg';
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 2000, 
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <div style={{ width: '50px', height: '50px', border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #FFF', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '24px' }} />
      <div style={{ color: '#FFF', fontSize: '1.2rem', fontWeight: 600, marginBottom: '16px' }}>Switching to</div>
      <img src={logo} alt={targetPlatform} style={{ height: '40px', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }} />
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

function NetflixModal({ movie, onClose, onPlay, onOpenDetails, onToggleMyList, isMyList, similarMovies, platform, detailedMovie, episodes, isLoadingEpisodes, selectedSeason, setSelectedSeason }: MovieDetailModalProps & { platform: string, detailedMovie: Movie | null, episodes: Episode[], isLoadingEpisodes: boolean, selectedSeason: number, setSelectedSeason: (season: number) => void }) {
  const displayMovie = detailedMovie || movie;
  const isTvShow = Boolean(displayMovie?.isSeries || movie?.isSeries || (displayMovie?.seasonsCount ?? 0) > 0);
  const [activeTab, setActiveTab] = useState<'episodes' | 'similar'>(isTvShow ? 'episodes' : 'similar');
  const [isLiked, setIsLiked] = useState(false);
  const { setPlatform } = usePlatform();
  const platformNameMap: Record<string, string> = { nflix: "Netflix", nprime: "Prime Video", hotstar: "Hotstar" };
  const nativePlatformName = platformNameMap[platform];
  const isAvailableNative = !movie?.availablePlatforms || movie.availablePlatforms.includes(nativePlatformName);
  const alternativePlatform = movie?.availablePlatforms?.find(p => p !== nativePlatformName);
  const [isSwitching, setIsSwitching] = useState(false);
  const handlePlayClick = () => { if (!movie) return;
    if (!isAvailableNative && alternativePlatform) {
      setIsSwitching(true);
      setTimeout(() => {
        const target = alternativePlatform === "Netflix" ? "nflix" : alternativePlatform === "Hotstar" ? "hotstar" : "nprime";
        setPlatform(target);
        setIsSwitching(false);
      }, 3500);
    } else {
      onPlay(displayMovie!);
    }
  };
  const { isMuted, toggleMute, renderTrailer, hasTrailer } = useTrailerPlayer(displayMovie?.trailerUrl || '', movie?.backdropUrl || movie?.posterUrl || '');
  const dominantColor = useDominantColor(movie?.backdropUrl || movie?.posterUrl || undefined, 'rgba(0,0,0,0.65)');

  if (!movie) return null;
  const matchScore = (displayMovie?.matchScore || parseInt(movie.id.replace(/\D/g, '') || '0') % 30 + 70);
  const rawScore = displayMovie?.score || (matchScore / 10);
  const ratingText = rawScore > 0 ? `${rawScore.toFixed(1)} / 10` : 'N/A';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      backgroundColor: dominantColor, backdropFilter: 'blur(30px)', overflowY: 'auto', padding: '32px 0',
      transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    }}>
      <div className="detail-dialog" onClick={e => e.stopPropagation()} style={{
        width: '92%', maxWidth: '850px',
        backgroundColor: platform === 'hotstar' ? '#0F1014' : platform === 'nprime' ? '#0F171E' : '#181818',
        borderRadius: platform === 'hotstar' ? '12px' : platform === 'nprime' ? '8px' : '10px',
        overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.98)', position: 'relative',
        animation: 'scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)', color: '#FFF', display: 'flex', flexDirection: 'column',
        border: platform === 'hotstar' ? '1px solid rgba(31, 128, 224, 0.3)' : platform === 'nprime' ? '1px solid rgba(0, 168, 225, 0.3)' : '1px solid rgba(255,255,255,0.1)',
        viewTransitionName: `movie-card-${movie.id}`
      }}>
        {isSwitching && alternativePlatform && <SwitchingLoader targetPlatform={alternativePlatform} />}
        <button onClick={onClose} autoFocus aria-label="Close modal" style={{
          position: 'absolute', top: '16px', right: '16px', width: '36px', height: '36px',
          borderRadius: '50%',
          backgroundColor: platform === 'hotstar' ? 'rgba(15,16,20,0.8)' : platform === 'nprime' ? 'rgba(15,23,30,0.8)' : '#181818',
          border: 'none', color: '#FFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, cursor: 'pointer',
          backdropFilter: 'blur(8px)'
        }}>
          <X size={20} />
        </button>

        <div className="detail-hero" style={{ position: 'relative', width: '100%', aspectRatio: '16/9', maxHeight: '480px', minHeight: '250px', backgroundColor: '#000', flexShrink: 0, overflow: 'hidden' }}>
          {renderTrailer()}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #181818 0%, transparent 50%)', zIndex: 15 }} />

          <div className="detail-hero-content" style={{ position: 'absolute', bottom: '20px', left: '24px', right: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 20 }}>
            <div>
              {renderPlatformBadges(movie.availablePlatforms)}
              {displayMovie?.logoUrl ? (
                <img className="detail-logo-img" src={displayMovie.logoUrl} style={{ maxWidth: '350px', maxHeight: '120px', objectFit: 'contain', marginBottom: '20px' }} />
              ) : (
                <h2 className="detail-title-text" style={{ fontSize: '3rem', fontWeight: 900, marginBottom: '20px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>{movie.title}</h2>
              )}

              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <button className="detail-play-btn" onClick={handlePlayClick} style={{
                  background: platform === 'hotstar' ? '#1F80E0' : platform === 'nprime' ? '#00A8E1' : '#FFF',
                  color: platform === 'nflix' ? '#000' : '#FFF',
                  border: 'none', borderRadius: '4px', padding: '10px 28px',
                  fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                  boxShadow: platform === 'hotstar' ? '0 4px 18px rgba(31, 128, 224, 0.4)' : platform === 'nprime' ? '0 4px 18px rgba(0, 168, 225, 0.4)' : 'none',
                  transition: 'transform 0.2s ease'
                }}>
                  <Play fill={platform === 'nflix' ? '#000' : '#FFF'} size={24} /> {(!isAvailableNative && alternativePlatform) ? `Watch on ${alternativePlatform}` : (platform === 'hotstar' ? 'Watch Now' : 'Play')}
                </button>
                <button className="detail-action-btn" onClick={() => onToggleMyList(movie.id)} style={{
                  background: 'rgba(42,42,42,0.6)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '50%',
                  width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF'
                }}>
                  {isMyList ? <Check size={20} /> : <Plus size={20} />}
                </button>
                <button className="detail-action-btn" onClick={() => setIsLiked(!isLiked)} style={{
                  background: isLiked ? (platform === 'hotstar' ? '#1F80E0' : platform === 'nprime' ? '#00A8E1' : '#E50914') : 'rgba(42,42,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.5)', borderRadius: '50%',
                  width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF',
                  transition: 'background 0.2s'
                }}>
                  <ThumbsUp size={20} fill={isLiked ? '#FFF' : 'none'} />
                </button>
              </div>
            </div>
          </div>
          
          {/* Mute button absolutely positioned to avoid mobile flex conflicts */}
          {hasTrailer && (
            <button onClick={toggleMute} style={{
              position: 'absolute', bottom: '20px', right: '24px',
              background: 'rgba(42,42,42,0.6)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '50%',
              width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF',
              zIndex: 50
            }}>
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          )}
        </div>

        <div className="detail-body" style={{ padding: '20px 24px' }}>
          <div className="detail-overview-grid" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', fontSize: '1rem', fontWeight: 500 }}>
              <span style={{ color: '#46d369', fontWeight: 700 }}>{matchScore}% Match</span>
              <span style={{ backgroundColor: '#F5C518', color: '#000', padding: '1px 6px', borderRadius: '3px', fontWeight: 700, fontSize: '0.85rem' }}>IMDb {ratingText}</span>
              <span style={{ color: '#BCBCBC' }}>{(displayMovie?.releaseDate || movie?.releaseDate || '').split('-')[0]}</span>
              <span style={{ border: '1px solid #BCBCBC', padding: '0 4px', color: '#BCBCBC', fontSize: '0.8rem' }}>U/A 16+</span>
              <span style={{ color: '#BCBCBC' }}>{displayMovie?.duration || movie?.duration}</span>
              <span style={{ border: '1px solid #BCBCBC', padding: '0 4px', color: '#BCBCBC', fontSize: '0.8rem', borderRadius: '3px' }}>HD</span>
              {(displayMovie?.audioLanguages?.length ?? 0) > 0 && (
                <span style={{ color: '#BCBCBC' }}>• {displayMovie?.audioLanguages?.slice(0, 2).join(', ')}</span>
              )}
            </div>
            <p style={{ fontSize: '1.1rem', lineHeight: 1.5, color: '#FFF', fontWeight: 400 }}>
              {displayMovie?.longDescription || movie.description}
            </p>
          </div>
          <div style={{ flex: '1', fontSize: '0.9rem', color: '#777', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><span style={{ color: '#777' }}>Cast: </span><span style={{ color: '#FFF' }}>{formatCastNames(displayMovie?.cast?.slice(0,4))} {(displayMovie?.cast?.length ?? 0) > 4 ? ', more' : ''}</span></div>
            <div><span style={{ color: '#777' }}>Genres: </span><span style={{ color: '#FFF' }}>{displayMovie?.genres?.join(', ')}</span></div>
            <div><span style={{ color: '#777' }}>This show is: </span><span style={{ color: '#FFF' }}>{displayMovie?.tags?.slice(0,3).join(', ')}</span></div>
          </div>
        </div>        <div className="detail-bottom-section" style={{ padding: '0 40px 40px 40px' }}>
          {(displayMovie?.isSeries || movie.isSeries || (displayMovie?.seasonsCount ?? 0) > 0) ? (
            <div style={{ display: 'flex', gap: '30px', borderBottom: '2px solid rgba(255,255,255,0.1)', marginBottom: '20px' }}>
              <button onClick={() => setActiveTab('episodes')} style={{ background: 'none', border: 'none', color: activeTab === 'episodes' ? '#FFF' : '#808080', fontSize: '1.2rem', fontWeight: 700, paddingBottom: '16px', borderBottom: activeTab === 'episodes' ? (platform === 'hotstar' ? '4px solid #1F80E0' : platform === 'nprime' ? '4px solid #00A8E1' : '4px solid #E50914') : '4px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }}>Episodes</button>
              <button onClick={() => setActiveTab('similar')} style={{ background: 'none', border: 'none', color: activeTab === 'similar' ? '#FFF' : '#808080', fontSize: '1.2rem', fontWeight: 700, paddingBottom: '16px', borderBottom: activeTab === 'similar' ? (platform === 'hotstar' ? '4px solid #1F80E0' : platform === 'nprime' ? '4px solid #00A8E1' : '4px solid #E50914') : '4px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }}>More Like This</button>
            </div>
          ) : (
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '20px' }}>More Like This</h3>
          )}

          {(!(displayMovie?.isSeries || movie.isSeries || (displayMovie?.seasonsCount ?? 0) > 0) || activeTab === 'similar') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {similarMovies.slice(0, 9).map(sim => (
                <div key={sim.id} onClick={() => onOpenDetails(sim)} style={{ backgroundColor: '#2F2F2F', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', paddingTop: '56.25%', flexShrink: 0 }}>
                    <img src={sim.backdropUrl || sim.posterUrl} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ padding: '16px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>{sim.title}</h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#BCBCBC' }}>
                      <span style={{ color: '#46d369' }}>{sim.matchScore || (parseInt(sim.id.replace(/\D/g, '') || '0') % 30 + 70)}% Match</span>
                      <span>{(sim.releaseDate || '').split('-')[0]}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#D2D2D2', marginTop: '12px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', flexGrow: 1 }}>{sim.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(displayMovie?.isSeries || movie.isSeries || (displayMovie?.seasonsCount ?? 0) > 0) && activeTab === 'episodes' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '1.1rem', color: '#D2D2D2' }}>Season {selectedSeason}</span>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>

                  {displayMovie?.seasonsCount && displayMovie.seasonsCount > 1 && (
                    <select value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))} style={{ background: '#242424', color: '#FFF', border: '1px solid #4D4D4D', padding: '8px 16px', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer', outline: 'none' }}>
                      {Array.from({ length: displayMovie.seasonsCount }, (_, i) => i + 1).map(s => <option key={s} value={s} style={{ background: '#181818', color: '#FFF' }}>Season {s}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {isLoadingEpisodes ? (
                  <>
                    <EpisodeSkeleton />
                    <EpisodeSkeleton />
                    <EpisodeSkeleton />
                  </>
                ) : (
                  episodes.map((ep, idx) => (
                    <div key={ep.id} onClick={() => onPlay(displayMovie!, ep)} style={{ display: 'flex', gap: '16px', padding: '16px', borderRadius: '4px', backgroundColor: '#222', cursor: 'pointer', alignItems: 'center' }}>
                      <div style={{ fontSize: '1.5rem', color: '#D2D2D2', width: '30px', textAlign: 'center' }}>{idx + 1}</div>
                      <div style={{ position: 'relative', width: '130px', height: '73px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden' }}>
                        <img src={ep.thumbnailUrl || movie.backdropUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}><Play size={30} fill="#FFF" color="#FFF" /></div>
                      </div>
                      <div style={{ flex: 1, paddingRight: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 700 }}>{ep.title}</span>
                          <span style={{ color: '#D2D2D2' }}>{ep.duration}</span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#D2D2D2', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ep.description || 'No description available for this episode.'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: '48px', paddingTop: '20px', borderTop: '2px solid #2F2F2F' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 400, marginBottom: '16px' }}>About <strong style={{ fontWeight: 700 }}>{movie.title}</strong></h3>
            <div style={{ color: '#777', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><span style={{ color: '#777' }}>Director: </span><span style={{ color: '#FFF' }}>{displayMovie?.director || 'Unknown'}</span></div>
              <div><span style={{ color: '#777' }}>Cast: </span><span style={{ color: '#FFF' }}>{formatCastNames(displayMovie?.cast)}</span></div>
              <div><span style={{ color: '#777' }}>Genres: </span><span style={{ color: '#FFF' }}>{displayMovie?.genres?.join(', ')}</span></div>
              {(displayMovie?.audioLanguages?.length ?? 0) > 0 && (
                <div><span style={{ color: '#777' }}>Audio: </span><span style={{ color: '#FFF' }}>{displayMovie?.audioLanguages?.join(', ')}</span></div>
              )}
              {(displayMovie?.subtitleLanguages?.length ?? 0) > 0 && (
                <div><span style={{ color: '#777' }}>Subtitles: </span><span style={{ color: '#FFF' }}>{displayMovie?.subtitleLanguages?.join(', ')}</span></div>
              )}
              <div><span style={{ color: '#777' }}>Maturity Rating: </span><span style={{ color: '#FFF', border: '1px solid #FFF', padding: '0 4px', marginRight: '6px' }}>{displayMovie?.maturityRating || movie.maturityRating}</span> <span style={{ color: '#FFF' }}>Recommended for mature audiences.</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrimeModal({ movie, onClose, onPlay, onOpenDetails, onToggleMyList, isMyList, similarMovies, platform, detailedMovie, episodes, isLoadingEpisodes, selectedSeason, setSelectedSeason }: MovieDetailModalProps & { platform: string, detailedMovie: Movie | null, episodes: Episode[], isLoadingEpisodes: boolean, selectedSeason: number, setSelectedSeason: (season: number) => void }) {
  const displayMovie = detailedMovie || movie;
  const isTvShow = Boolean(displayMovie?.isSeries || movie?.isSeries || (displayMovie?.seasonsCount ?? 0) > 0);
  const [activeTab, setActiveTab] = useState<'episodes' | 'related' | 'details'>(isTvShow ? 'episodes' : 'related');
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const { setPlatform } = usePlatform();
  const platformNameMap: Record<string, string> = { nflix: "Netflix", nprime: "Prime Video", hotstar: "Hotstar" };
  const nativePlatformName = platformNameMap[platform];
  const isAvailableNative = !movie?.availablePlatforms || movie.availablePlatforms.includes(nativePlatformName);
  const alternativePlatform = movie?.availablePlatforms?.find(p => p !== nativePlatformName);
  const [isSwitching, setIsSwitching] = useState(false);
  
  const handlePlayClick = () => { if (!movie) return;
    if (!isAvailableNative && alternativePlatform) {
      setIsSwitching(true);
      setTimeout(() => {
        const target = alternativePlatform === "Netflix" ? "nflix" : alternativePlatform === "Hotstar" ? "hotstar" : "nprime";
        setPlatform(target);
        setIsSwitching(false);
      }, 3500);
    } else {
      onPlay(displayMovie!);
    }
  };

  const { isMuted, toggleMute, renderTrailer, hasTrailer } = useTrailerPlayer(displayMovie?.trailerUrl || '', movie?.backdropUrl || movie?.posterUrl || '', 5000);

  if (!movie) return null;
  const matchScore = (displayMovie?.matchScore || parseInt(movie.id.replace(/\D/g, '') || '0') % 30 + 70);
  const rawScore = displayMovie?.score || (matchScore / 10);
  const ratingText = rawScore > 0 ? `${rawScore.toFixed(1)}` : 'N/A';
  
  // Fake badges
  const isNew = parseInt(movie.id) % 3 === 0;

  return (
    <div className="prime-detail-page" role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
      backgroundColor: '#0f171e', overflowY: 'auto', overflowX: 'hidden', color: '#FFF',
      animation: 'fadeIn 0.3s ease'
    }}>
      {isSwitching && alternativePlatform && <SwitchingLoader targetPlatform={alternativePlatform} />}
      
      {/* Solid background blocker to prevent scrolled content from showing under the transparent global Navbar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '70px', backgroundColor: '#0f171e', zIndex: 1500 }} />

      <div className="detail-hero" style={{ position: 'relative', width: '100%', height: '80vh', minHeight: '500px', flexShrink: 0, overflow: 'hidden', marginTop: '70px' }}>
        
        {/* Header Back Button */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '24px 40px', zIndex: 50, display: 'flex', alignItems: 'center' }}>
          <button onClick={onClose} style={{
            background: 'rgba(0,0,0,0.4)', border: 'none', color: '#FFF', borderRadius: '50%',
            width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            backdropFilter: 'blur(4px)'
          }}>
            <ArrowLeft size={24} />
          </button>
        </div>

        {renderTrailer()}
        
        {/* Gradients to blend into background */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #0f171e 0%, rgba(15,23,30,0.9) 35%, rgba(15,23,30,0) 70%), linear-gradient(to top, #0f171e 0%, transparent 40%)', zIndex: 15, pointerEvents: 'none' }} />

        {hasTrailer && (
          <button onClick={toggleMute} style={{
            position: 'absolute', top: '30px', right: '40px',
            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '50%',
            width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF',
            zIndex: 50
          }}>
            {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </button>
        )}

        <div className="detail-hero-content" style={{ position: 'absolute', bottom: '10%', left: '40px', right: '40px', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
          
          {/* Logo / Title (Above everything) */}
          <div style={{ marginBottom: '24px' }}>
            {displayMovie?.logoUrl ? (
              <img src={displayMovie.logoUrl} style={{ maxWidth: '400px', maxHeight: '140px', objectFit: 'contain' }} />
            ) : (
              <h1 style={{ fontSize: '3.5rem', fontWeight: 800, margin: '0', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{movie.title}</h1>
            )}
          </div>

          {/* Two-Column Layout for Buttons & Details */}
          <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
            
            {/* Left Column: Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Circular Buttons Row */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => {
                    const scrollable = document.querySelector('.prime-detail-page');
                    if (scrollable) scrollable.scrollTo({ top: 0, behavior: 'smooth' });
                    if (isMuted) toggleMute();
                  }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF', transition: 'background 0.2s', backdropFilter: 'blur(8px)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFF'; e.currentTarget.style.color = '#000'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#FFF'; }}>
                    <Play size={24} />
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Trailer</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => onToggleMyList(movie.id)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF', transition: 'background 0.2s', backdropFilter: 'blur(8px)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFF'; e.currentTarget.style.color = '#000'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#FFF'; }}>
                    {isMyList ? <Check size={26} /> : <Plus size={26} />}
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Watchlist</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => { setIsLiked(!isLiked); setIsDisliked(false); }} style={{ background: isLiked ? '#00A8E1' : 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF', transition: 'background 0.2s', backdropFilter: 'blur(8px)' }}
                  onMouseEnter={e => { if(!isLiked) { e.currentTarget.style.background = '#FFF'; e.currentTarget.style.color = '#000'; } }}
                  onMouseLeave={e => { if(!isLiked) { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#FFF'; } }}>
                    <ThumbsUp size={24} fill={isLiked ? '#FFF' : 'none'} />
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Like</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => { setIsDisliked(!isDisliked); setIsLiked(false); }} style={{ background: isDisliked ? '#FFF' : 'rgba(255,255,255,0.2)', color: isDisliked ? '#000' : '#FFF', border: 'none', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s', backdropFilter: 'blur(8px)' }}
                  onMouseEnter={e => { if(!isDisliked) { e.currentTarget.style.background = '#FFF'; e.currentTarget.style.color = '#000'; } }}
                  onMouseLeave={e => { if(!isDisliked) { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#FFF'; } }}>
                    <ThumbsDown size={24} fill={isDisliked ? '#000' : 'none'} />
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Not for me</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF', transition: 'background 0.2s', backdropFilter: 'blur(8px)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFF'; e.currentTarget.style.color = '#000'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#FFF'; }}>
                    <Share2 size={24} />
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Share</span>
                </div>
              </div>

              {/* Big Play Button */}
              <button onClick={handlePlayClick} style={{
                background: '#FFF', color: '#000', border: 'none', borderRadius: '6px', padding: '16px',
                width: '344px',
                fontSize: '1.25rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'transform 0.2s ease, background 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e6e6e6'}
              onMouseLeave={e => e.currentTarget.style.background = '#FFF'}
              >
                <Play fill="#000" size={26} /> {(!isAvailableNative && alternativePlatform) ? `Watch on ${alternativePlatform}` : 'Play Movie'}
              </button>
            </div>

            {/* Right Column: Text Details */}
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '600px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px', letterSpacing: '0.5px' }}>
                Subscribe
              </div>
              <div style={{ color: '#00a8e1', fontWeight: 700, fontSize: '1.05rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(0,168,225,0.1)', padding: '4px 10px', borderRadius: '4px', width: 'fit-content' }}>
                <Check size={18} color="#00a8e1" strokeWidth={3} /> Watch with a Prime membership
              </div>
              
              {(isTvShow && isNew) && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '0.9rem', fontWeight: 700 }}>
                  <span style={{ backgroundColor: '#fff', color: '#000', padding: '2px 6px', borderRadius: '2px' }}>SEASON PREMIERE</span>
                  <span style={{ color: '#00a8e1' }}>New episode Wednesday</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00a8e1', fontSize: '0.85rem', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <Sparkles size={16} /> <span>AI Summary</span>
              </div>
              <p style={{ fontSize: '1.15rem', lineHeight: 1.5, color: '#FFF', fontWeight: 500, marginBottom: '16px', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                {displayMovie?.description || movie.description}
              </p>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '1.05rem', color: '#8197a4', fontWeight: 600, marginBottom: '16px', flexWrap: 'wrap' }}>
                {(displayMovie?.tags?.slice(0,3) || []).map((t: string, i: number, arr: string[]) => (
                  <React.Fragment key={t}>
                    <span style={{ color: '#FFF' }}>{t}</span>
                    {i < arr.length - 1 && <span>•</span>}
                  </React.Fragment>
                ))}
                <span style={{ color: '#FFF', marginLeft: '12px' }}>{(displayMovie?.releaseDate || movie?.releaseDate || '').split('-')[0]}</span>
                {isTvShow && <span style={{ color: '#FFF' }}>{displayMovie?.seasonsCount || 1} seasons</span>}
                <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '1px 6px', borderRadius: '3px', fontSize: '0.85rem', color: '#FFF' }}>U/A 16+</span>
                <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '1px 6px', borderRadius: '3px', fontSize: '0.85rem', color: '#FFF' }}>UHD</span>
              </div>

              <div style={{ fontSize: '1.05rem', color: '#8197a4' }}>
                Cast: <span style={{ color: '#FFF' }}>{formatCastNames(displayMovie?.cast)}</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="detail-body" style={{ padding: '0 40px 60px 40px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', gap: '32px', borderBottom: '2px solid rgba(255,255,255,0.1)', marginBottom: '32px' }}>
          {(displayMovie?.isSeries || movie.isSeries || (displayMovie?.seasonsCount ?? 0) > 0) && <button onClick={() => setActiveTab('episodes')} style={{ background: 'none', border: 'none', color: activeTab === 'episodes' ? '#FFF' : '#8197a4', fontSize: '1.25rem', fontWeight: 700, paddingBottom: '16px', borderBottom: activeTab === 'episodes' ? '3px solid #FFF' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }}>Episodes</button>}
          <button onClick={() => setActiveTab('related')} style={{ background: 'none', border: 'none', color: activeTab === 'related' ? '#FFF' : '#8197a4', fontSize: '1.25rem', fontWeight: 700, paddingBottom: '16px', borderBottom: activeTab === 'related' ? '3px solid #FFF' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }}>Related</button>
          <button onClick={() => setActiveTab('details')} style={{ background: 'none', border: 'none', color: activeTab === 'details' ? '#FFF' : '#8197a4', fontSize: '1.25rem', fontWeight: 700, paddingBottom: '16px', borderBottom: activeTab === 'details' ? '3px solid #FFF' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }}>Details</button>
        </div>

        {activeTab === 'episodes' && (displayMovie?.isSeries || movie.isSeries || (displayMovie?.seasonsCount ?? 0) > 0) && (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{episodes.length} episodes</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <select value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.1)', color: '#FFF', border: '1px solid rgba(255,255,255,0.3)', padding: '12px 20px', borderRadius: '4px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
                  {Array.from({ length: displayMovie?.seasonsCount || 1 }, (_, i) => i + 1).map(s => <option key={s} value={s} style={{ background: '#24303c', color: '#FFF' }}>Season {s}</option>)}
                </select>
              </div>
            </div>
            
            {isLoadingEpisodes ? (
              <>
                <EpisodeSkeleton />
                <EpisodeSkeleton />
                <EpisodeSkeleton />
              </>
            ) : (
              episodes.map((ep, idx) => (
                <div key={ep.id} onClick={() => onPlay(displayMovie!, ep)} style={{ display: 'flex', gap: '24px', padding: '24px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '220px', height: '124px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden', backgroundColor: '#111' }}>
                    <img src={ep.thumbnailUrl || movie.backdropUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.4)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
                    >
                      <Play size={40} fill="#FFF" color="#FFF" />
                    </div>
                  </div>
                  <div style={{ flex: 1, paddingRight: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 700 }}>{idx + 1}. {ep.title}</h4>
                    <p style={{ fontSize: '1rem', color: '#8197a4', margin: '0 0 16px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{ep.description || 'No description available for this episode.'}</p>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '0.9rem', color: '#8197a4', fontWeight: 600 }}>
                      <span style={{ border: '1px solid #8197a4', padding: '1px 6px', borderRadius: '3px' }}>U/A 16+</span>
                      <span>{ep.duration}</span>
                      <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
           </div>
        )}

        {activeTab === 'related' && (
          <div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>Customers also watched</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
              {similarMovies.slice(0, 12).map(sim => (
                <div key={sim.id} onClick={() => onOpenDetails(sim)} style={{ borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.05)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ position: 'relative', aspectRatio: '2/3' }}>
                    <img src={sim.posterUrl || sim.backdropUrl} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#00a8e1', marginBottom: '8px', letterSpacing: '0.5px' }}>✓ PRIME</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sim.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', color: '#8197a4', fontSize: '1.1rem' }}>
            <p style={{ fontSize: '1.15rem', lineHeight: 1.6, color: '#FFF', fontWeight: 400, maxWidth: '800px', marginBottom: '16px' }}>
              {displayMovie?.longDescription || movie.description}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px 24px' }}>
              <strong style={{ color: '#FFF', fontWeight: 700 }}>Audio languages</strong> <span>{displayMovie?.audioLanguages?.join(', ') || 'English, English [Audio Description]'}</span>
              <strong style={{ color: '#FFF', fontWeight: 700 }}>Subtitles</strong> <span>{displayMovie?.subtitleLanguages?.join(', ') || 'English [CC]'}</span>
              <strong style={{ color: '#FFF', fontWeight: 700 }}>Directors</strong> <span>{displayMovie?.director || 'Unknown'}</span>
              <strong style={{ color: '#FFF', fontWeight: 700 }}>Starring</strong> <span>{formatCastNames(displayMovie?.cast)}</span>
              <strong style={{ color: '#FFF', fontWeight: 700 }}>Studio</strong> <span>Amazon Studios</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '80px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', color: '#8197a4', fontSize: '1rem' }}>
          <div>By clicking play, you agree to our <a href="#" style={{ color: '#00a8e1', textDecoration: 'none' }}>Terms of Use</a>.</div>
          <div style={{ display: 'flex', gap: '40px', fontWeight: 700 }}>
            <a href="#" style={{ color: '#FFF', textDecoration: 'none' }}>Send us feedback</a>
            <a href="#" style={{ color: '#FFF', textDecoration: 'none' }}>Get Help</a>
          </div>
          <div style={{ fontSize: '0.9rem', display: 'flex', gap: '20px' }}>
            <a href="#" style={{ color: '#8197a4', textDecoration: 'none' }}>Terms and Privacy Notice</a>
            <a href="#" style={{ color: '#8197a4', textDecoration: 'none' }}>Send us feedback</a>
            <a href="#" style={{ color: '#8197a4', textDecoration: 'none' }}>Help</a>
            <span>© 1996-2026, Amazon.com, Inc. or its affiliates</span>
          </div>
        </div>

      </div>
    </div>
  );
}

function HotstarModal({ movie, onClose, onPlay, onOpenDetails, onToggleMyList, isMyList, similarMovies, platform, detailedMovie, episodes, isLoadingEpisodes, selectedSeason, setSelectedSeason }: MovieDetailModalProps & { platform: string, detailedMovie: Movie | null, episodes: Episode[], isLoadingEpisodes: boolean, selectedSeason: number, setSelectedSeason: (season: number) => void }) {
  const displayMovie = detailedMovie || movie;
  const isTvShow = Boolean(displayMovie?.isSeries || movie?.isSeries || (displayMovie?.seasonsCount ?? 0) > 0);
  const [activeTab, setActiveTab] = useState<'episodes' | 'more'>(isTvShow ? 'episodes' : 'more');
  const { setPlatform } = usePlatform();
  const platformNameMap: Record<string, string> = { nflix: "Netflix", nprime: "Prime Video", hotstar: "Hotstar" };
  const nativePlatformName = platformNameMap[platform];
  const isAvailableNative = !movie?.availablePlatforms || movie.availablePlatforms.includes(nativePlatformName);
  const alternativePlatform = movie?.availablePlatforms?.find(p => p !== nativePlatformName);
  const [isSwitching, setIsSwitching] = useState(false);
  const handlePlayClick = () => { if (!movie) return;
    if (!isAvailableNative && alternativePlatform) {
      setIsSwitching(true);
      setTimeout(() => {
        const target = alternativePlatform === "Netflix" ? "nflix" : alternativePlatform === "Hotstar" ? "hotstar" : "nprime";
        setPlatform(target);
        setIsSwitching(false);
      }, 3500);
    } else {
      onPlay(displayMovie!);
    }
  };
  const { isMuted, toggleMute, renderTrailer, hasTrailer } = useTrailerPlayer(displayMovie?.trailerUrl || '', movie?.backdropUrl || movie?.posterUrl || '');
  const dominantColor = useDominantColor(movie?.backdropUrl || movie?.posterUrl || undefined, 'rgba(0,0,0,0.85)');

  if (!movie) return null;
  const matchScore = (displayMovie?.matchScore || parseInt(movie.id.replace(/\D/g, '') || '0') % 30 + 70);
  const rawScore = displayMovie?.score || (matchScore / 10);
  const ratingText = rawScore > 0 ? `${rawScore.toFixed(1)} / 10` : 'N/A';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center',
      backgroundColor: dominantColor, backdropFilter: 'blur(30px)', padding: '20px', overflowY: 'auto',
      transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    }}>
      <div className="detail-dialog" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '900px', background: 'linear-gradient(to bottom, #0f1014, #000)', borderRadius: '12px',
        overflow: 'hidden', position: 'relative', color: '#FFF', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.9)', maxHeight: '90vh',
        viewTransitionName: `movie-card-${movie.id}`
      }}>
        {isSwitching && alternativePlatform && <SwitchingLoader targetPlatform={alternativePlatform} />}
        <button onClick={onClose} autoFocus aria-label="Close modal" style={{
          position: 'absolute', top: '24px', right: '24px', width: '36px', height: '36px',
          borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, cursor: 'pointer'
        }}>
          <X size={20} />
        </button>

        <div className="detail-hero" style={{ position: 'relative', width: '100%', aspectRatio: '16/9', maxHeight: '480px', minHeight: '250px', flexShrink: 0, overflow: 'hidden' }}>
          {renderTrailer()}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0f1014 0%, rgba(15,16,20,0.6) 50%, transparent 100%), linear-gradient(to right, #0f1014 0%, transparent 50%)', zIndex: 15 }} />

          <div className="detail-hero-content" style={{ position: 'absolute', bottom: '30px', left: '40px', right: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 20 }}>
            <div className="detail-hero-info">
              {displayMovie?.logoUrl ? (
                <img src={displayMovie.logoUrl} style={{ maxWidth: '320px', maxHeight: '110px', objectFit: 'contain', marginBottom: '16px' }} />
              ) : (
                <h2 style={{ fontSize: '2.6rem', fontWeight: 800, marginBottom: '16px', letterSpacing: '-0.02em' }}>{movie.title}</h2>
              )}

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', fontSize: '0.9rem', color: '#FFF', fontWeight: 600 }}>
                <span style={{ backgroundColor: '#F5C518', color: '#000', padding: '1px 6px', borderRadius: '3px', fontWeight: 800 }}>IMDb {ratingText}</span>
                <span>{(displayMovie?.releaseDate || movie?.releaseDate || '').split('-')[0]}</span>
                <span>•</span>
                <span>{displayMovie?.duration || movie?.duration}</span>
                <span>•</span>
                <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>U/A 13+</span>
                <span>•</span>
                <span style={{ color: '#E1E6F0' }}>{displayMovie?.genres?.slice(0,3).join(', ')}</span>
                {(displayMovie?.audioLanguages?.length ?? 0) > 0 && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#E1E6F0' }}>{displayMovie?.audioLanguages?.slice(0, 2).join(', ')}</span>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <button onClick={handlePlayClick} style={{
                  background: 'linear-gradient(90deg, #1f80e0, #14599c)', color: '#FFF', border: 'none', borderRadius: '8px', padding: '14px 48px',
                  fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(31,128,224,0.4)'
                }}>
                  <Play fill="#FFF" size={20} /> {(!isAvailableNative && alternativePlatform) ? `Watch on ${alternativePlatform}` : 'Watch Now'}
                </button>
                <button onClick={() => onToggleMyList(movie.id)} style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
                  width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF'
                }}>
                  {isMyList ? <Check size={24} /> : <Plus size={24} />}
                </button>

              </div>
            </div>

            {hasTrailer && (
              <button onClick={toggleMute} style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF',
                zIndex: 50
              }}>
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            )}
          </div>
        </div>

        <div className="detail-body" style={{ padding: '20px 40px 40px 40px', color: '#E1E6F0', overflowY: 'auto' }}>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.6, fontWeight: 400, maxWidth: '90%', marginBottom: '24px' }}>
            {displayMovie?.longDescription || movie.description}
          </p>
          <div style={{ display: 'flex', gap: '40px', fontSize: '0.95rem', marginBottom: '32px' }}>
            {(displayMovie?.cast?.length ?? 0) > 0 && (
              <div>
                <strong style={{ color: '#FFF', display: 'block', marginBottom: '4px' }}>Cast</strong>
                <div style={{ color: '#979CA6' }}>{formatCastNames(displayMovie?.cast)}</div>
              </div>
            )}
            {displayMovie?.director && (
              <div>
                <strong style={{ color: '#FFF', display: 'block', marginBottom: '4px' }}>Director</strong>
                <div style={{ color: '#979CA6' }}>{displayMovie.director}</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
            {(displayMovie?.isSeries || movie.isSeries || (displayMovie?.seasonsCount ?? 0) > 0) && <button onClick={() => setActiveTab('episodes')} style={{ background: 'none', border: 'none', color: activeTab === 'episodes' ? '#FFF' : '#8F98B0', fontSize: '1.1rem', fontWeight: 700, paddingBottom: '12px', borderBottom: activeTab === 'episodes' ? '3px solid #FFF' : '3px solid transparent', cursor: 'pointer' }}>Episodes</button>}
            <button onClick={() => setActiveTab('more')} style={{ background: 'none', border: 'none', color: activeTab === 'more' ? '#FFF' : '#8F98B0', fontSize: '1.1rem', fontWeight: 700, paddingBottom: '12px', borderBottom: activeTab === 'more' ? '3px solid #FFF' : '3px solid transparent', cursor: 'pointer' }}>More Like This</button>
          </div>

          {activeTab === 'episodes' && (displayMovie?.isSeries || movie.isSeries || (displayMovie?.seasonsCount ?? 0) > 0) && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '10px' }}>
                <select value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))} style={{ background: '#191c24', color: '#FFF', border: '1px solid rgba(31,128,224,0.4)', padding: '10px 16px', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', width: 'fit-content', outline: 'none' }}>
                  {Array.from({ length: displayMovie?.seasonsCount || 1 }, (_, i) => i + 1).map(s => <option key={s} value={s} style={{ background: '#222631', color: '#FFF' }}>Season {s}</option>)}
                </select>
              </div>
              {isLoadingEpisodes ? (
                <>
                  <EpisodeSkeleton />
                  <EpisodeSkeleton />
                  <EpisodeSkeleton />
                </>
              ) : (
                episodes.map((ep, idx) => (
                  <div key={ep.id} onClick={() => onPlay(displayMovie!, ep)} style={{ display: 'flex', gap: '20px', padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'pointer', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '180px', height: '101px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden' }}>
                      <img src={ep.thumbnailUrl || movie.backdropUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}><Play size={30} fill="#FFF" color="#FFF" /></div>
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{ep.duration}</div>
                    </div>
                    <div style={{ flex: 1, paddingRight: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600 }}>E{idx + 1} - {ep.title}</h4>
                      <p style={{ fontSize: '0.9rem', color: '#979CA6', margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ep.description || 'No description available for this episode.'}</p>
                    </div>
                  </div>
                ))
              )}
             </div>
          )}

          {(!isTvShow || activeTab === 'more') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
              {similarMovies.slice(0, 10).map(sim => (
                <div key={sim.id} onClick={() => onOpenDetails(sim)} style={{ borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s', backgroundColor: '#151820' }}>
                  <img src={sim.posterUrl || sim.backdropUrl} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}

          {/* ─── Recommended For You (Backend AI Recommendations) ────────────── */}
          <RecommendationsSection movie={movie} onOpenDetails={onOpenDetails} />

        </div>
      </div>
    </div>
  );
}

export const MovieDetailModal: React.FC<MovieDetailModalProps> = (props) => {
  const { platform } = usePlatform();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const movieDetails = useMovieDetails(props.movie, selectedSeason, platform);

  const modalProps = { ...props, platform, ...movieDetails, selectedSeason, setSelectedSeason };

  if (platform === 'nflix') return <NetflixModal {...modalProps} />;
  if (platform === 'nprime') return <PrimeModal {...modalProps} />;
  return <HotstarModal {...modalProps} />;
};

function RecommendationsSection({ movie, onOpenDetails }: { movie: Movie; onOpenDetails: (m: Movie) => void }) {
  const { platform } = usePlatform();
  const [recs, setRecs] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!movie?.id || fetched) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const fetchPlatform = movie.platform || platform;
        const results = await fetchRecommendationsApi(movie.id, fetchPlatform);
        setRecs(results.slice(0, 12));
      } catch {}
      setLoading(false);
      setFetched(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [movie?.id, platform]);

  if (!loading && recs.length === 0) return null;

  return (
    <div style={{ marginTop: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Sparkles size={16} style={{ color: 'var(--primary-color)' }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>Recommended For You</h3>
      </div>
      {loading ? (
        <div style={{ display: 'flex', gap: '12px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ width: '140px', aspectRatio: '2/3', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', flexShrink: 0, animation: 'pulse 1.5s infinite ease-in-out' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
          {recs.map((rec) => (
            <div
              key={rec.id}
              onClick={() => onOpenDetails(rec)}
              style={{ flexShrink: 0, width: '130px', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', transition: 'transform 0.2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              <img
                src={rec.posterUrl || rec.backdropUrl}
                alt={rec.title}
                style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block', borderRadius: '8px' }}
              />
              <div style={{ padding: '6px 4px 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {rec.title}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

