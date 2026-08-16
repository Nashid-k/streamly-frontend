import React from 'react';
import { Sparkles, Search } from 'lucide-react';
import { MovieCard } from './MovieCard';
import { Movie, Actor } from '../types';

interface SearchViewProps {
  platform?: string;
  popularMovies?: Movie[];
  searchQuery: string;
  onSearchChange?: (query: string) => void;
  isSearching: boolean;
  languageFilteredSearchResults: Movie[];
  searchActor?: Actor;
  isAILoading: boolean;
  onAISearch: () => void;
  onClearSearch: () => void;
  onPlayMovie: (m: Movie) => void;
  onOpenDetails: (m: Movie) => void;
  onToggleMyList: (id: string) => void;
  myList: string[];
}

export const SearchView: React.FC<SearchViewProps> = ({
  platform,
  popularMovies = [],
  searchQuery,
  onSearchChange,
  isSearching,
  languageFilteredSearchResults,
  searchActor,
  isAILoading,
  onAISearch,
  onClearSearch,
  onPlayMovie,
  onOpenDetails,
  onToggleMyList,
  myList
}) => {
  if (platform === 'hotstar') {
    return (
      <div style={{ paddingTop: '80px', paddingBottom: '60px', paddingLeft: '4%', paddingRight: '4%', minHeight: '80vh' }}>
        <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto 40px auto' }}>
          <Search size={28} color="#1F80E0" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Movies, shows and more"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '18px 20px 18px 64px',
              fontSize: '1.2rem',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '8px',
              color: '#FFF',
              outline: 'none',
            }}
          />
        </div>

        {searchQuery.trim() === '' ? (
          <>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '20px', color: '#FFF' }}>Popular Searches</h3>
            <div className="classic-grid">
              {popularMovies.slice(0, 12).map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onPlay={() => onPlayMovie(movie)}
                  onOpenDetails={() => onOpenDetails(movie)}
                  onToggleMyList={() => onToggleMyList(movie.id)}
                  isMyList={myList.includes(movie.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#FFF', marginBottom: '6px' }}>
                  {`Results for "${searchQuery}"`}
                </h2>
                <p style={{ color: '#AAA', fontSize: '0.9rem' }}>
                  {isSearching ? 'Searching catalog…' : `Found ${languageFilteredSearchResults.length} matching title${languageFilteredSearchResults.length === 1 ? '' : 's'}`}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={onAISearch}
                  disabled={isAILoading || isSearching}
                  style={{
                    backgroundColor: 'rgba(229, 9, 20, 0.15)',
                    color: '#E50914',
                    border: '1px solid rgba(229, 9, 20, 0.4)',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: (isAILoading || isSearching) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={14} />
                  {isAILoading ? 'AI Thinking...' : 'Smart Search'}
                </button>
                <button
                  onClick={onClearSearch}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#FFF',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Clear Search
                </button>
              </div>
            </div>

            {isSearching ? (
              <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary-color)',
                  animation: 'spin 1s linear infinite'
                }} />
              </div>
            ) : languageFilteredSearchResults.length === 0 ? (
              <div style={{ padding: '80px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: '1.2rem', color: '#888', marginBottom: '8px' }}>
                  Your search for "{searchQuery}" did not have any matches.
                </p>
                <p style={{ color: '#666' }}>Suggestions: Try different keywords or check spelling.</p>
              </div>
            ) : (
              <div className="classic-grid">
                {languageFilteredSearchResults.map((movie) => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    onPlay={() => onPlayMovie(movie)}
                    onOpenDetails={() => onOpenDetails(movie)}
                    onToggleMyList={() => onToggleMyList(movie.id)}
                    isMyList={myList.includes(movie.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingTop: '110px', width: '100%', minHeight: '80vh', paddingBottom: '60px' }}>
      <div style={{ padding: '0 4%', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#FFF', marginBottom: '6px' }}>
            {`Results for "${searchQuery}"`}
          </h2>
          <p style={{ color: '#AAA', fontSize: '0.9rem' }}>
            {isSearching ? 'Searching catalog…' : `Found ${languageFilteredSearchResults.length} matching title${languageFilteredSearchResults.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onAISearch}
            disabled={isAILoading || isSearching}
            style={{
              backgroundColor: 'rgba(229, 9, 20, 0.15)',
              color: '#E50914',
              border: '1px solid rgba(229, 9, 20, 0.4)',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: (isAILoading || isSearching) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} />
            {isAILoading ? 'AI Thinking...' : 'Smart Search'}
          </button>
          <button
            onClick={onClearSearch}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#FFF',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Clear Search
          </button>
        </div>
      </div>

      {isSearching && languageFilteredSearchResults.length === 0 && !searchActor ? (
        <div className="classic-grid" style={{ padding: '0 4%' }}>
          {[...Array(12)].map((_, i) => (
            <div key={i} style={{ 
              aspectRatio: '2/3', 
              backgroundColor: 'rgba(255, 255, 255, 0.05)', 
              borderRadius: '8px', 
              animation: 'netflixSkeletonPulse 2s infinite ease-in-out',
              animationDelay: `${(i % 4) * 0.1}s`
            }} />
          ))}
        </div>
      ) : languageFilteredSearchResults.length || searchActor || isSearching ? (
        <>
          {searchActor && (
            <div style={{ margin: '0 4% 32px 4%', padding: '24px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', display: 'flex', gap: '24px', alignItems: 'center' }}>
              <img src={searchActor.profileUrl} alt={searchActor.name} style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-color)' }} />
              <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>{searchActor.name}</h2>
                <p style={{ color: '#AAA', fontSize: '0.9rem', lineHeight: '1.4' }}>{searchActor.knownFor}</p>
              </div>
            </div>
          )}
          <div className="classic-grid">
            {languageFilteredSearchResults.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onPlay={onPlayMovie}
                onOpenDetails={onOpenDetails}
                onToggleMyList={onToggleMyList}
                isMyList={myList.includes(movie.id)}
                isSearchResult={true}
              />
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: '80px 4%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#FFF' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            <Sparkles size={32} color="#AAA" />
          </div>
          <p style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '12px' }}>{`We couldn't find "${searchQuery}"`}</p>
          <p style={{ fontSize: '0.95rem', color: '#777', maxWidth: '400px', marginBottom: '32px', lineHeight: '1.5' }}>
            Try searching by another title, cast member, or let our AI find similar movies for you.
          </p>
          <button
            onClick={onAISearch}
            disabled={isAILoading}
            style={{
              backgroundColor: '#E50914',
              color: '#FFF',
              border: 'none',
              padding: '12px 28px',
              borderRadius: '24px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: isAILoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(229, 9, 20, 0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(229, 9, 20, 0.6)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(229, 9, 20, 0.4)'; }}
          >
            <Sparkles size={18} />
            {isAILoading ? 'Finding Recommendations...' : 'Ask AI for Recommendations'}
          </button>
        </div>
      )}
    </div>
  );
};
