// Regenerate the social-preview image and PNG icon rasters from source SVG.
//   node scripts/generate-assets.mjs   (or: npm run assets)
//
// Outputs into public/:
//   og.png                 1200x630 Open Graph / Twitter card
//   apple-touch-icon.png   180x180  iOS home-screen icon
//   favicon-32x32.png      32x32    PNG favicon fallback
//
// The OG image is a self-contained SVG rasterised via sharp. Text uses the
// system monospace / sans-serif fallbacks (JetBrains Mono / Inter aren't
// installed at build time), which still matches the site's black + coral theme.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

const CORAL = '#ff7f66';
const WHITE = '#ffffff';
const GRAY = '#8c8c8c';
const GRAY_LIGHT = '#bfbfbf';
const WIRE = '#2e2e2e';

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#000000"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="${WIRE}" stroke-width="1" rx="10"/>
  <rect x="40" y="40" width="1120" height="6" fill="${CORAL}"/>

  <rect x="70" y="150" width="6" height="150" fill="${CORAL}"/>

  <text x="102" y="150" font-family="monospace" font-size="24" letter-spacing="8" fill="${GRAY}">THE HANDBOOK</text>

  <text x="100" y="238" font-family="monospace" font-size="78" font-weight="bold" fill="${WHITE}">Secure Software</text>
  <text x="100" y="330" font-family="monospace" font-size="78" font-weight="bold" fill="${WHITE}">Delivery Architecture</text>

  <text x="102" y="410" font-family="sans-serif" font-size="31" fill="${GRAY_LIGHT}">Trust, identity, and software supply chains &#8212; from</text>
  <text x="102" y="452" font-family="sans-serif" font-size="31" fill="${GRAY_LIGHT}">a developer's commit to a running production workload.</text>

  <text x="102" y="516" font-family="monospace" font-size="22" fill="${GRAY}">Developer <tspan fill="${CORAL}">&#8594;</tspan> Git <tspan fill="${CORAL}">&#8594;</tspan> Build <tspan fill="${CORAL}">&#8594;</tspan> Artifact <tspan fill="${CORAL}">&#8594;</tspan> Deployment <tspan fill="${CORAL}">&#8594;</tspan> Runtime</text>

  <text x="102" y="562" font-family="monospace" font-size="20" fill="#595959">securesoftwaredelivery.wckd14.xyz</text>
</svg>`;

await sharp(Buffer.from(og)).png().toFile(pub('og.png'));
console.log('wrote public/og.png (1200x630)');

const faviconSvg = await readFile(pub('favicon.svg'));
await sharp(faviconSvg).resize(180, 180).png().toFile(pub('apple-touch-icon.png'));
console.log('wrote public/apple-touch-icon.png (180x180)');
await sharp(faviconSvg).resize(32, 32).png().toFile(pub('favicon-32x32.png'));
console.log('wrote public/favicon-32x32.png (32x32)');
