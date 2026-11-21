/**
 * Builds a single self-contained HTML preview of the web app:
 * JS inlined, fonts embedded as data URIs, phone-width frame on desktop.
 *   SINGLE_BUNDLE=1 npx expo export --platform web --output-dir dist-preview
 *   node scripts/build-preview.js dist-preview preview/around.html
 */
const fs = require('fs');
const path = require('path');

const [, , distDir = 'dist-preview', outFile = 'preview/around.html'] = process.argv;
const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]);

const KEEP_FONTS = /(Ionicons|IBMPlexSansArabic_(400|500|600|700))/;
let js = scripts.map((src) => fs.readFileSync(path.join(distDir, src), 'utf8')).join('\n;\n');
const missing = [];
js = js.replace(/"(\/assets\/[^"]+\.(ttf|png))"/g, (all, p, ext) => {
  if (ext === 'ttf' && !KEEP_FONTS.test(p)) return '""';
  const file = path.join(distDir, p);
  if (!fs.existsSync(file)) {
    missing.push(p);
    return all;
  }
  const mime = ext === 'ttf' ? 'font/ttf' : 'image/png';
  return `"data:${mime};base64,${fs.readFileSync(file).toString('base64')}"`;
});
if (/"\/_expo\/static\/js\/web\/[^"]+\.js"/.test(js)) throw new Error('Bundle still has async chunks; build with SINGLE_BUNDLE=1');
// Keep </script> sequences inside the bundle from closing the inline tag.
js = js.replace(/<\/script/gi, '<\\/script');

const page = `<title>Al Dawri</title>
<meta name="theme-color" content="#0B2E6F">
<style>
  :root { --frame: #E2E7EF; --bg: #F2F4F8; }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--frame); }
  #root { display: flex; height: 100%; flex: 1; max-width: 460px; margin: 0 auto; background: var(--bg); box-shadow: 0 0 0 1px rgba(11,31,68,.06), 0 20px 60px rgba(11,31,68,.12); overflow: hidden; position: relative; }
  @media (max-width: 500px) { #root { max-width: none; box-shadow: none; } }
</style>
<script>
  // The preview is hosted under an unknown path: start the router at "/".
  try { if (location.pathname !== '/') history.replaceState(null, '', '/' + location.hash); } catch (e) {}
</script>
<div id="root"></div>
<script>${js}</script>
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, page);
console.log(`wrote ${outFile} (${(page.length / 1024 / 1024).toFixed(2)} MB)`, missing.length ? `missing: ${missing.join(', ')}` : '');
