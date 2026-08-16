const fs = require('fs');
const file = 'src/components/MovieCard.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add isExpanded state
code = code.replace(/const \[isHovered, setIsHovered\] = useState\(false\);/, 
  "const [isHovered, setIsHovered] = useState(false);\n  const [isExpanded, setIsExpanded] = useState(false);\n  const expandTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);");

code = code.replace(/const handleMouseEnter = \(\) => \{[\s\S]*?setIsHovered\(true\);/, 
`const handleMouseEnter = () => {
    if (!isHovered) playHoverSound();
    setIsHovered(true);
    if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
    expandTimeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
    }, 450);`);

code = code.replace(/const handleMouseLeave = \(\) => \{[\s\S]*?setIsHovered\(false\);/, 
`const handleMouseLeave = () => {
    setIsHovered(false);
    setIsExpanded(false);
    if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);`);

// 2. HOTSTAR
code = code.replace(/className="hotstar-card-inner"[\s\S]*?transform: isHovered \? `scale\(1\.25\).*? : 'scale\(1\)',/, (match) => {
  let m = match.replace(/transform: isHovered \? `scale\(1\.25\).*? : 'scale\(1\)',/, "transform: isExpanded ? 'scale(1.25)' : 'scale(1)',");
  m = m.replace(/boxShadow: isHovered \?/, "boxShadow: isExpanded ?");
  m = m.replace(/border: isHovered \?/, "border: isExpanded ?");
  m = m.replace(/zIndex: isHovered \?/, "zIndex: isExpanded ?");
  m = m.replace(/transition: `transform 0.45s.*?z-index 0s.*?`,/, "transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.4s ease, border 0.35s ease, z-index 0s',");
  if (!m.includes('overflow:')) {
    m = m.replace(/style=\{\{/, "style={{\n            overflow: isExpanded ? 'visible' : 'hidden',");
  }
  return m;
});

// Update Hotstar expanding-meta to have maxHeight transition and rich data
const hotstarDropdownRegex = /<div className="expanding-meta" style=\{\{[\s\S]*?\}\}>[\s\S]*?<span className="moviecard-elem-09e479">[\s\S]*?<\/span>[\s\S]*?<h4 className="moviecard-elem-a0014f">\{movie.title\}<\/h4>[\s\S]*?\{(!movie.availablePlatforms[\s\S]*?)\}[\s\S]*?<\/div>/;
code = code.replace(hotstarDropdownRegex, `
          <div className="expanding-meta" style={{
            padding: isExpanded ? '14px' : '0 14px',
            opacity: isExpanded ? 1 : 0,
            visibility: isExpanded ? 'visible' : 'hidden',
            maxHeight: isExpanded ? '300px' : '0px',
            overflow: 'hidden',
            transition: 'max-height 0.4s ease, padding 0.4s ease, opacity 0.4s ease, visibility 0.4s',
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
          </div>`);


// 3. PRIME
code = code.replace(/className="nprime-card-inner"[\s\S]*?transform: isHovered \? `scale\(1\.25\).*? : 'scale\(1\)',/, (match) => {
  let m = match.replace(/transform: isHovered \? `scale\(1\.25\).*? : 'scale\(1\)',/, "transform: isExpanded ? 'scale(1.25)' : 'scale(1)',");
  m = m.replace(/boxShadow: isHovered \?/, "boxShadow: isExpanded ?");
  m = m.replace(/border: isHovered \?/, "border: isExpanded ?");
  m = m.replace(/zIndex: isHovered \?/, "zIndex: isExpanded ?");
  m = m.replace(/transition: `transform 0.45s.*?z-index 0s.*?`,/, "transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.4s ease, border 0.35s ease, z-index 0s',");
  if (!m.includes('overflow:')) {
    m = m.replace(/style=\{\{/, "style={{\n            overflow: isExpanded ? 'visible' : 'hidden',");
  }
  return m;
});

const primeDropdownRegex = /<div className="expanding-meta" style=\{\{[\s\S]*?\}\}>[\s\S]*?<h4 className="moviecard-elem-d88b98">\{movie.title\}<\/h4>[\s\S]*?<div style=\{\{ display: 'flex'[\s\S]*?<\/div>\s*<\/div>/;
code = code.replace(primeDropdownRegex, `
          <div className="expanding-meta" style={{
            padding: isExpanded ? '12px' : '0 12px',
            opacity: isExpanded ? 1 : 0,
            visibility: isExpanded ? 'visible' : 'hidden',
            maxHeight: isExpanded ? '300px' : '0px',
            overflow: 'hidden',
            transition: 'max-height 0.4s ease, padding 0.4s ease, opacity 0.4s ease, visibility 0.4s',
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
          </div>`);


// 4. NETFLIX
code = code.replace(/className="netflix-card-inner"[\s\S]*?transform: isHovered \? `scale\(1\.25\).*? : 'scale\(1\)',/, (match) => {
  let m = match.replace(/transform: isHovered \? `scale\(1\.25\).*? : 'scale\(1\)',/, "transform: isExpanded ? 'scale(1.25)' : 'scale(1)',");
  m = m.replace(/boxShadow: isHovered \?/, "boxShadow: isExpanded ?");
  m = m.replace(/zIndex: isHovered \?/, "zIndex: isExpanded ?");
  m = m.replace(/transition: `transform 0.45s.*?z-index 0s.*?`,/, "transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.4s ease, background-color 0.4s ease, z-index 0s',");
  if (!m.includes('overflow:')) {
    m = m.replace(/style=\{\{\s*position: 'absolute',/, "style={{\n          position: 'absolute',\n          overflow: isExpanded ? 'visible' : 'hidden',");
  }
  return m;
});

const netflixDropdownRegex = /<div className="expanding-meta" style=\{\{[\s\S]*?opacity: isHovered \? 1 : 0,[\s\S]*?visibility: isHovered \? 'visible' : 'hidden',[\s\S]*?\}\}>/;
code = code.replace(netflixDropdownRegex, `
        <div className="expanding-meta" style={{
          padding: isExpanded ? '12px' : '0 12px',
          opacity: isExpanded ? 1 : 0,
          visibility: isExpanded ? 'visible' : 'hidden',
          maxHeight: isExpanded ? '300px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.4s ease, padding 0.4s ease, opacity 0.4s ease, visibility 0.4s',
          backgroundColor: '#141414',
          borderRadius: '0 0 4px 4px',
          width: '100%',
        }}>`);

// Clean up border radius transitions to avoid popping
code = code.replace(/borderRadius: isHovered \? '10px 10px 0 0' : '10px'/g, "borderRadius: isExpanded ? '10px 10px 0 0' : '10px'");
code = code.replace(/borderRadius: isHovered \? '6px 6px 0 0' : '6px'/g, "borderRadius: isExpanded ? '6px 6px 0 0' : '6px'");
code = code.replace(/borderRadius: isHovered \? '4px 4px 0 0' : '4px'/g, "borderRadius: isExpanded ? '4px 4px 0 0' : '4px'");

fs.writeFileSync(file, code);
