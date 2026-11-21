// Renders the logo SVGs in assets/brand to the PNG files Expo uses (needs Playwright + Chromium).
//   node scripts/brand/render_icons.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const B = path.join(root, 'assets', 'brand');
const jobs = [
  ['icon.svg', 'assets/icon.png', 1024, 1024],
  ['splash.svg', 'assets/splash-icon.png', 1024, 1024],
  ['adaptive-foreground.svg', 'assets/android-icon-foreground.png', 1024, 1024],
  ['adaptive-monochrome.svg', 'assets/android-icon-monochrome.png', 1024, 1024],
  ['icon.svg', 'assets/favicon.png', 48, 48],
  ['icon-rounded.svg', 'assets/brand/app-icon.png', 512, 512],
  ['wordmark-white.svg', 'assets/brand/wordmark-white.png', 600, null],
  ['wordmark-navy.svg', 'assets/brand/wordmark-navy.png', 600, null],
  ['lockup-navy.svg', 'assets/brand/lockup-navy.png', 600, null],
  ['lockup-white.svg', 'assets/brand/lockup-white.png', 600, null],
];
(async () => {
  const b = await chromium.launch();
  for (const [src, out, w, hFixed] of jobs) {
    const svg = fs.readFileSync(path.join(B, src), 'utf8');
    const [, vw, vh] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const h = hFixed ?? Math.round((w * vh) / vw);
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`)}</body></html>`);
    await p.screenshot({ path: path.join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    await p.close();
  }
  await b.close();
  console.log('rendered', jobs.length, 'files');
})();
