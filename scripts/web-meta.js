// Adds the home-screen icon, app name and install metadata to the web build (Expo's single-page export has none).
// Usage: node scripts/web-meta.js dist
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || 'dist';
const src = path.join(__dirname, '..', 'assets', 'web');
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(out, f));

const tags = [
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />',
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="الدوري" />',
  '<meta name="application-name" content="الدوري" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  '<meta name="theme-color" content="#0B2E6F" />',
  '<meta name="description" content="احجز ملعبك، انضم لمباراة، وشارك بالبطولات في الكويت" />',
].join('\n    ');

const file = path.join(out, 'index.html');
let html = fs.readFileSync(file, 'utf8');
// Language only: the app handles right-to-left layout itself, so no dir attribute here.
html = html.replace('<html lang="en">', '<html lang="ar">');
html = html.replace(/<title>[^<]*<\/title>/, '<title>الدوري</title>');
html = html.replace('<link rel="icon" href="/favicon.ico"/>', '');
html = html.replace('</head>', `    ${tags}\n  </head>`);
fs.writeFileSync(file, html);
console.log('web metadata added');
