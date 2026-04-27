/**
 * Generates PWA icons (PNG) from the embedded SVG watering-can design.
 * Run with: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = join(__dir, '..');

// ── SVG source ──────────────────────────────────────────────────────────────
// Designed on a 512×512 canvas.
// Safe zone for maskable: content within inner 409×409 (80 %).
const svg = /* xml */`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">

  <!-- Background — full bleed, dark forest green -->
  <rect width="512" height="512" fill="#2D5016"/>

  <!-- ── Watering can (cream #F2EAD8) ── -->

  <!-- Body -->
  <rect x="215" y="188" width="188" height="168" rx="22" fill="#F2EAD8"/>

  <!-- Neck / opening rim on top of body -->
  <rect x="254" y="167" width="104" height="26" rx="13" fill="#F2EAD8"/>

  <!-- Spout tube: from body-left (215, 262) angled up-left to tip (88, 233) -->
  <line x1="88"  y1="233"
        x2="215" y2="262"
        stroke="#F2EAD8" stroke-width="34" stroke-linecap="round"/>

  <!-- Rose (sprinkler head) at spout tip -->
  <ellipse cx="74" cy="224" rx="32" ry="24" fill="#F2EAD8"/>

  <!-- Handle: arc on right side of body -->
  <path d="M401 212 Q468 212 468 272 Q468 334 401 334"
        fill="none" stroke="#F2EAD8" stroke-width="30" stroke-linecap="round"/>

  <!-- ── Water drops (light green #7dbf4e) ── -->
  <!-- Falling below the rose (rose bottom ≈ y 248) -->
  <circle cx="55"  cy="276" r="11" fill="#7dbf4e"/>
  <circle cx="82"  cy="270" r="11" fill="#7dbf4e"/>
  <circle cx="40"  cy="302" r="9"  fill="#7dbf4e"/>
  <circle cx="68"  cy="300" r="9"  fill="#7dbf4e"/>

</svg>
`.trim();

// ── Output sizes ─────────────────────────────────────────────────────────────
const targets = [
  { size: 512, out: 'public/icons/icon-512x512.png'              },
  { size: 192, out: 'public/icons/icon-192x192.png'              },
  { size: 180, out: 'public/icons/apple-touch-icon-180x180.png'  },
  { size:  32, out: 'public/favicon-32x32.png'                   },
];

await mkdir(join(root, 'public/icons'), { recursive: true });

for (const { size, out } of targets) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(root, out));
  console.log(`✓ ${out} (${size}×${size})`);
}

console.log('\nDone — commit public/icons/ and public/favicon-32x32.png');
