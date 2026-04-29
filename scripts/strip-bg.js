#!/usr/bin/env node
// Strip solid black/dark backgrounds from PNG icons, replacing them with
// full transparency. Run once: node scripts/strip-bg.js
// Fuzz tolerance: pixels where R<30, G<30, B<30 become alpha=0.
// Edge antialiasing handled by proportional alpha blending in the 30-60 range.

const sharp = require('sharp');
const path  = require('path');

const ICONS = [
  path.join(__dirname, '../icons/icon-16.png'),
  path.join(__dirname, '../icons/icon-32.png'),
  path.join(__dirname, '../icons/icon-48.png'),
  path.join(__dirname, '../icons/icon-128.png'),
];

const FULL_ALPHA_THRESH = 30;   // fully transparent below this
const BLEND_THRESH      = 60;   // partial blend up to here

async function stripBlackBg(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data);
  const { width, height, channels } = info; // channels === 4 after ensureAlpha

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = Math.max(r, g, b);

    if (brightness < FULL_ALPHA_THRESH) {
      pixels[i + 3] = 0; // fully transparent
    } else if (brightness < BLEND_THRESH) {
      // linear fade: 0 at FULL_ALPHA_THRESH, 255 at BLEND_THRESH
      const t = (brightness - FULL_ALPHA_THRESH) / (BLEND_THRESH - FULL_ALPHA_THRESH);
      pixels[i + 3] = Math.round(t * 255);
    }
    // else: keep original alpha
  }

  await sharp(Buffer.from(pixels), {
    raw: { width, height, channels },
  })
    .png()
    .toFile(filePath);

  // Quick sanity: read top-left pixel
  const { data: verify } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const topLeftAlpha = verify[3];
  console.log(`✓ ${path.basename(filePath)}  ${width}×${height}  top-left alpha=${topLeftAlpha}`);
}

(async () => {
  for (const f of ICONS) {
    await stripBlackBg(f);
  }
  console.log('\nAll icons processed — backgrounds removed.');
})().catch(err => { console.error(err); process.exit(1); });
