const fs = require('fs');

const file = '/home/edure/Desktop/AIOS-ALL IN ONE STREAM/frontend/src/components/MovieDetailModal.tsx';
let content = fs.readFileSync(file, 'utf8');

// We need to import Navbar at the top of MovieDetailModal.tsx
if (!content.includes('import { Navbar }')) {
  content = content.replace("import { usePlatform } from './PlatformContext';", "import { usePlatform } from './PlatformContext';\nimport { Navbar } from './Navbar';");
}

fs.writeFileSync(file, content, 'utf8');
console.log("Navbar imported");
