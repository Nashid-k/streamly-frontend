const fs = require('fs');
const file = 'src/components/MovieCard.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. HOTSTAR: Add rich data to expanding dropdown
code = code.replace(/<div style=\{\{\s*position: 'absolute',[\s\S]*?\{platformBadges\}/, `
          <div className="expanding-meta" style={{
            padding: '14px',
            opacity: isExpanded ? 1 : 0,
            visibility: isExpanded ? 'visible' : 'hidden',
            maxHeight: isExpanded ? '250px' : '0px',
            overflow: 'hidden',
            transition: 'max-height 0.4s ease, opacity 0.4s ease, visibility 0.4s',
            backgroundColor: '#0F1014',
            borderRadius: '0 0 10px 10px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
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
            <div className="moviecard-elem-0e6893" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 600 }}>
              <span style={{ color: '#4ade80' }}>{movie.matchScore}% Match</span>
              <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '0 4px', borderRadius: '2px', color: '#FFF' }}>{movie.maturityRating || 'U/A 13+'}</span>
              <span style={{ color: '#8f98b0' }}>{movie.duration || (movie.isSeries ? 'Series' : 'Film')}</span>
              <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '0 4px', borderRadius: '2px', color: '#FFF' }}>HD</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#8f98b0', fontWeight: 600 }}>
              {movie.genres.slice(0, 3).join(' • ')}
            </div>
          </div>
          {platformBadges}`);

code = code.replace(/className="hotstar-card-inner"[\s\S]*?transform: isExpanded \? 'scale\(1\.05\)' : 'scale\(1\)',/, (match) => {
  return match.replace("scale(1.05)", "scale(1.25)");
});

// 2. PRIME: Add rich data to expanding dropdown
code = code.replace(/<div style=\{\{\s*position: 'absolute',\s*inset: 0,[\s\S]*?\{platformBadges\}/, `
          <div className="expanding-meta" style={{
            padding: '12px',
            opacity: isExpanded ? 1 : 0,
            visibility: isExpanded ? 'visible' : 'hidden',
            maxHeight: isExpanded ? '250px' : '0px',
            overflow: 'hidden',
            transition: 'max-height 0.4s ease, opacity 0.4s ease, visibility 0.4s',
            backgroundColor: '#0F171E',
            borderRadius: '0 0 6px 6px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
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
            <div className="moviecard-elem-0e6893" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#8197a4' }}>
              <span style={{ color: '#4ade80' }}>{movie.matchScore}% Match</span>
              <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '0 4px', borderRadius: '2px', color: '#FFF' }}>{movie.maturityRating || 'U/A 13+'}</span>
              <span>{movie.duration || (movie.isSeries ? 'Series' : 'Film')}</span>
              <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '0 4px', borderRadius: '2px', color: '#FFF' }}>HD</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#8197a4', fontWeight: 600 }}>
              {movie.genres.slice(0, 3).join(' • ')}
            </div>
          </div>
          {platformBadges}`);

// Ensure overflow is visible on the wrappers so they don't clip the inner expanded dropdowns
code = code.replace(/width: '185px',[\s\S]*?overflow: 'hidden',/g, (match) => {
  return match.replace("overflow: 'hidden',", "overflow: 'visible',");
});
code = code.replace(/width: `\$\{nprimeWidth\}px`,[\s\S]*?overflow: 'hidden',/g, (match) => {
  return match.replace("overflow: 'hidden',", "overflow: 'visible',");
});

// Since the wrappers overflow visible, the inner containers can overflow visible too when expanded
code = code.replace(/className="hotstar-card-inner"[\s\S]*?overflow: 'hidden',/g, (match) => {
  return match.replace("overflow: 'hidden',", "overflow: isExpanded ? 'visible' : 'hidden',");
});
code = code.replace(/className="nprime-card-inner"[\s\S]*?overflow: 'hidden',/g, (match) => {
  return match.replace("overflow: 'hidden',", "overflow: isExpanded ? 'visible' : 'hidden',");
});

fs.writeFileSync(file, code);
