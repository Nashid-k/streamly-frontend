const fs = require('fs');
const file = 'src/components/MovieCard.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add isExpanded state and delay logic
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

// 2. Fix Hotstar card inner styling
code = code.replace(/className="hotstar-card-inner"[\s\S]*?style=\{\{([\s\S]*?)\}\}/, (match, p1) => {
  let style = p1.replace(/boxShadow:.*?isHovered.*?,/, "boxShadow: isExpanded ? '0 12px 32px rgba(0,0,0,0.85), 0 0 16px rgba(31, 128, 224, 0.6)' : '0 4px 14px rgba(0,0,0,0.5)',")
    .replace(/border:.*?isHovered.*?,/, "border: isExpanded ? '2px solid rgba(31, 128, 224, 0.9)' : '1px solid rgba(255,255,255,0.05)',")
    .replace(/transform:.*?isHovered.*?,/, "transform: isExpanded ? 'scale(1.25)' : 'scale(1)',")
    .replace(/zIndex:.*?isHovered.*?,/, "zIndex: isExpanded ? 50 : 1,")
    .replace(/transition:.*?z-index.*?isHovered.*?,/, "transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.4s ease, border 0.3s ease, z-index 0s',");
  
  if (!style.includes('overflow:')) {
    style += "overflow: 'hidden',\n            ";
  }
  return `className="hotstar-card-inner"\n          ref={cardRef}\n          style={{${style}}}`;
});

code = code.replace(/className="expanding-meta" style=\{\{([\s\S]*?)width: '100%',/g, (match, p1) => {
  return `className="expanding-meta" style={{${p1}width: '100%',\n            maxHeight: isExpanded ? '250px' : '0px',\n            padding: isExpanded ? '14px' : '0 14px',\n            overflow: 'hidden',`;
});
code = code.replace(/opacity: isHovered \? 1 : 0/g, "opacity: isExpanded ? 1 : 0");
code = code.replace(/visibility: isHovered \? 'visible' : 'hidden'/g, "visibility: isExpanded ? 'visible' : 'hidden'");
code = code.replace(/borderRadius: isHovered \? '10px 10px 0 0' : '10px'/g, "borderRadius: '10px'");
code = code.replace(/borderRadius: isHovered \? '6px 6px 0 0' : '6px'/g, "borderRadius: '6px'");
code = code.replace(/borderRadius: isHovered \? '4px 4px 0 0' : '4px'/g, "borderRadius: '4px'");


// 3. Fix Prime card inner styling
code = code.replace(/className="nprime-card-inner"[\s\S]*?style=\{\{([\s\S]*?)\}\}/, (match, p1) => {
  let style = p1.replace(/boxShadow:.*?isHovered.*?,/, "boxShadow: isExpanded ? '0 12px 30px rgba(0,0,0,0.95), 0 0 20px rgba(0, 168, 225, 0.6)' : '0 4px 12px rgba(0,0,0,0.6)',")
    .replace(/border:.*?isHovered.*?,/, "border: isExpanded ? '2px solid #00A8E1' : '1px solid rgba(255,255,255,0.06)',")
    .replace(/transform:.*?isHovered.*?,/, "transform: isExpanded ? 'scale(1.25)' : 'scale(1)',")
    .replace(/zIndex:.*?isHovered.*?,/, "zIndex: isExpanded ? 50 : 1,")
    .replace(/transition:.*?z-index.*?isHovered.*?,/, "transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.4s ease, border 0.3s ease, z-index 0s',");
  
  if (!style.includes('overflow:')) {
    style += "overflow: 'hidden',\n            ";
  }
  return `className="nprime-card-inner"\n          ref={cardRef}\n          style={{${style}}}`;
});

// 4. Fix Netflix card inner styling
code = code.replace(/className="netflix-card-inner"[\s\S]*?style=\{\{\s*position: 'absolute',([\s\S]*?)\}\}/, (match, p1) => {
  let style = p1.replace(/boxShadow:.*?isHovered.*?,/, "boxShadow: isExpanded ? '0 20px 40px rgba(0,0,0,0.95), 0 10px 20px rgba(0,0,0,0.7)' : 'none',")
    .replace(/transform:.*?isHovered.*?,/, "transform: isExpanded ? 'scale(1.25)' : 'scale(1)',")
    .replace(/zIndex:.*?isHovered.*?,/, "zIndex: isExpanded ? 50 : 1,")
    .replace(/transition:.*?z-index.*?isHovered.*?,/, "transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.4s ease, background-color 0.4s ease, z-index 0s',");
  
  return `className="netflix-card-inner"\n          ref={cardRef}\n          style={{\n          position: 'absolute',\n          overflow: 'hidden',${style}}}`;
});

fs.writeFileSync(file, code);
