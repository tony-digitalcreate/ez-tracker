// One-off: generate PWA icons from an SVG using the sharp already in ez-convert.
const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'ez-convert', 'node_modules', 'sharp'));

const OUT = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// blue rounded square + white tick, faint notebook rules like the family look
const iconAny = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4d8cf5"/><stop offset="1" stop-color="#1747b6"/>
    </linearGradient>
  </defs>
  <rect x="26" y="26" width="460" height="460" rx="104" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-opacity="0.13" stroke-width="3">
    <line x1="26" y1="140" x2="486" y2="140"/><line x1="26" y1="230" x2="486" y2="230"/>
    <line x1="26" y1="320" x2="486" y2="320"/><line x1="26" y1="410" x2="486" y2="410"/>
  </g>
  <path d="M 140 268 L 216 344 L 372 172" fill="none" stroke="#ffffff" stroke-width="56"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const iconMaskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4d8cf5"/><stop offset="1" stop-color="#1747b6"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" fill="url(#g)"/>
  <path d="M 160 266 L 226 332 L 356 194" fill="none" stroke="#ffffff" stroke-width="48"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function run() {
  await sharp(Buffer.from(iconAny)).resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'));
  await sharp(Buffer.from(iconAny)).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
  await sharp(Buffer.from(iconMaskable)).resize(192, 192).png().toFile(path.join(OUT, 'maskable-192.png'));
  await sharp(Buffer.from(iconMaskable)).resize(512, 512).png().toFile(path.join(OUT, 'maskable-512.png'));
  await sharp(Buffer.from(iconAny)).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'));
  await sharp(Buffer.from(iconAny)).resize(32, 32).png().toFile(path.join(OUT, 'favicon-32.png'));
  console.log('icons written to', OUT);
}
run().catch(e => { console.error(e); process.exit(1); });
