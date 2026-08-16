const fs = require('fs');
const file = 'src/components/MovieCard.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. FIX HOTSTAR
// Remove expanding-meta and replace it with an inline overlay that shows on hover
code = code.replace(/<div className="expanding-meta"[\s\S]*?\{platformBadges\}/, `
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            padding: '16px',
            background: 'linear-gradient(to top, rgba(15,16,20,1) 0%, rgba(15,16,20,0.8) 50%, transparent 100%)',
            opacity: isExpanded ? 1 : 0,
            transition: 'opacity 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 20,
            pointerEvents: isExpanded ? 'auto' : 'none'
          }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#8f98b0', fontWeight: 600 }}>
              <span>{movie.duration || '2023'}</span>
              <span>•</span>
              <span>{movie.genres?.[0] || (movie.isSeries ? 'Series' : 'Movie')}</span>
            </div>
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
          {platformBadges}`);

// Fix hotstar scale
code = code.replace(/transform: isExpanded \? 'scale\(1\.25\)' : 'scale\(1\)',/g, "transform: isExpanded ? 'scale(1.05)' : 'scale(1)',");

// 2. FIX PRIME
// Remove expanding-meta and replace it with an inline overlay that shows on hover
code = code.replace(/<div className="expanding-meta"[\s\S]*?\{platformBadges\}/, `
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(15,23,30,0.9) 0%, rgba(15,23,30,0.4) 50%, transparent 100%)',
            opacity: isExpanded ? 1 : 0,
            transition: 'opacity 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '12px',
            zIndex: 20,
            pointerEvents: isExpanded ? 'auto' : 'none'
          }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</h4>
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
          {platformBadges}`);


fs.writeFileSync(file, code);
