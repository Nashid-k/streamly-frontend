'use client';

import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MovieCard } from './MovieCard';
import { usePlatform } from './PlatformContext';
import { Movie } from '../types';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface MovieRowProps {
  title: string;
  movies: Movie[];
  onPlay: (movie: Movie) => void;
  onOpenDetails: (movie: Movie) => void;
  onToggleMyList: (movieId: string) => void;
  myList: string[];
  isTop10?: boolean;
  onExploreAll?: (title: string) => void;
}

export const MovieRow: React.FC<MovieRowProps> = ({
  title,
  movies,
  onPlay,
  onOpenDetails,
  onToggleMyList,
  myList,
  isTop10,
  onExploreAll,
}) => {
  
  const { platform } = usePlatform();
  const rowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtStart, setIsAtStart] = useState(true);
  const [isAtEnd, setIsAtEnd] = useState(false);

  const entry = useIntersectionObserver(containerRef, {
    freezeOnceVisible: true,
    rootMargin: '200px 0px', // Load 200px before scrolling into view
  });
  const isVisible = !!entry?.isIntersecting;

  const checkScrollRef = useRef<number | null>(null);
  const checkScroll = () => {
    if (checkScrollRef.current) return;
    checkScrollRef.current = window.requestAnimationFrame(() => {
      if (rowRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
        setIsAtStart(scrollLeft <= 5);
        setIsAtEnd(Math.ceil(scrollLeft + clientWidth) >= scrollWidth - 5);
      }
      checkScrollRef.current = null;
    });
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [movies]);


  const handleScroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      // Account for 12px gap between cards in the 0.8 multiplier
      const scrollTo = direction === 'left' ? scrollLeft - (clientWidth * 0.8) : scrollLeft + (clientWidth * 0.8);
      rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  if (!movies || movies.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      className="catalog-row" 
      style={{ 
        marginBottom: '64px', 
        padding: '0 4%', 
        position: 'relative', 
        zIndex: 1,
        minHeight: '280px', // Prevent layout shift before render
      }}
      onMouseEnter={(e) => e.currentTarget.style.zIndex = '50'}
      onMouseLeave={(e) => e.currentTarget.style.zIndex = '1'}
    >
      {!isVisible ? (
        <div style={{ width: '100%', minHeight: '280px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: '200px', height: '28px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '20px', animation: 'pulse 1.5s infinite ease-in-out' }} />
          <div style={{ display: 'flex', gap: '12px', overflow: 'hidden' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ flexShrink: 0, width: platform === 'nprime' ? '280px' : platform === 'nflix' ? '290px' : '185px', height: platform === 'nprime' ? '158px' : platform === 'nflix' ? '163px' : '275px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: `pulse 1.5s infinite ease-in-out ${(i * 0.1).toFixed(1)}s` }} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Category Row Header with Accent Bar & Explore All Link */}
      <div className="catalog-row-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '4px', height: '24px', background: platform === 'nprime' ? 'var(--primary-color)' : platform === 'hotstar' ? '#1F80E0' : 'linear-gradient(180deg, #E50914 0%, #FF5252 100%)', borderRadius: '4px' }} />
          <h3
            style={{
              fontSize: '1.45rem',
              fontWeight: 800,
              color: '#F8FAFC',
              letterSpacing: '-0.025em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {title}
          </h3>
        </div>

        <button
          onClick={() => {
            if (onExploreAll) {
              onExploreAll(title);
            } else {
              handleScroll('right');
            }
          }}
          className="row-explore-all"
          style={{
            background: 'none',
            border: 'none',
            color: platform === 'nprime' ? '#00A8E1' : platform === 'hotstar' ? '#1F80E0' : '#808080',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FFF')}
          onMouseLeave={(e) => (e.currentTarget.style.color = platform === 'nprime' ? '#00A8E1' : platform === 'hotstar' ? '#1F80E0' : '#808080')}
        >
          <span>{platform === 'hotstar' ? 'Explore All' : 'See All'}</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Row Container with Glass Nav Controls */}
      <div style={{ position: 'relative' }}>
        {/* Left Arrow Button */}
        {!isAtStart && (
        <button
          className="row-nav-btn left"
          onClick={() => handleScroll('left')}
          aria-label={`Scroll ${title} left`}
          style={{
            position: 'absolute',
            left: '-20px',
            top: platform === 'nflix' ? 'calc(50% - 80px)' : '50%',
            transform: 'translateY(-50%)',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            zIndex: 200,
            backgroundColor: 'rgba(15, 15, 15, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(12px)',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.85)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-color)';
            e.currentTarget.style.borderColor = 'var(--primary-color)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(15, 15, 15, 0.92)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
          }}
        >
          <ChevronLeft size={26} />
        </button>
        )}

        {/* Scrollable Movies Row */}
        <div
          className="catalog-row-track hide-scrollbar"
          ref={rowRef}
          onScroll={checkScroll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            overflowX: 'auto', overflowY: 'visible',
            padding: platform === 'nflix' 
                ? '40px 20px 200px 20px' // huge bottom padding for Netflix dropdown to prevent vertical clipping
                : '30px 20px 30px 20px',
            marginTop: platform === 'nflix' ? '-30px' : '-20px',
            marginBottom: platform === 'nflix' ? '-190px' : '-20px', // negative margin to compensate for padding
            scrollBehavior: 'smooth',
          }}
        >
          {movies.map((movie, index) => (
            isTop10 ? (
              // Wrapper gives the giant rank number room to hang left outside the card
              <div
                key={movie.id}
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  paddingLeft: index === 0 ? '60px' : '70px',
                }}
              >
                {/* Giant rank number behind the card */}
                <div
                  className="top10-number"
                  style={{
                    position: 'absolute',
                    left: 0,
                    bottom: '-25px',
                    zIndex: 0,
                    transform: index === 0 ? 'translateX(-12%)' : 'translateX(-6%)',
                    fontSize: '160px',
                    fontWeight: 900,
                    fontFamily: '"Arial Black", Arial, sans-serif',
                    color: '#000',
                    WebkitTextStroke: '4px #595959',
                    letterSpacing: '-0.1em',
                    lineHeight: 1,
                    pointerEvents: 'none',
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <MovieCard
                    movie={movie}
                    onPlay={onPlay}
                    onOpenDetails={onOpenDetails}
                    onToggleMyList={onToggleMyList}
                    isMyList={myList.includes(movie.id)}
                    top10Rank={undefined}
                  />
                </div>
              </div>
            ) : (
              <MovieCard
                key={movie.id}
                movie={movie}
                onPlay={onPlay}
                onOpenDetails={onOpenDetails}
                onToggleMyList={onToggleMyList}
                isMyList={myList.includes(movie.id)}
              />
            )
          ))}
        </div>

        {/* Right Arrow Button */}
        {!isAtEnd && (
        <button
          className="row-nav-btn right"
          onClick={() => handleScroll('right')}
          aria-label={`Scroll ${title} right`}
          style={{
            position: 'absolute',
            right: '-20px',
            top: platform === 'nflix' ? 'calc(50% - 80px)' : '50%',
            transform: 'translateY(-50%)',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            zIndex: 200,
            backgroundColor: 'rgba(15, 15, 15, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(12px)',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.85)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-color)';
            e.currentTarget.style.borderColor = 'var(--primary-color)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(15, 15, 15, 0.92)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
          }}
        >
          <ChevronRight size={26} />
        </button>
        )}
      </div>
        </>
      )}
    </div>
  );
};
