const fs = require('fs');
const c = fs.readFileSync('src/pages/SettingsPage.jsx','utf8');
const m = c.match(/Theme/g);
console.log(m?m.length:0);
