#!/usr/bin/env node
/**
 * Regenerates every favicon / app icon / social image from the one source logo.
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * Source of truth: public/images/logo.png (transparent, square-ish).
 * Everything else in this file is derived — never hand-edit the outputs.
 */
import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "public", "images", "logo.png");

/** Brand teal, sampled from the logo itself. Matches --primary in globals.css. */
const TEAL = "#02746a";
const WHITE = "#ffffff";

const out = (...p) => path.join(ROOT, ...p);

/**
 * The full mark loses all its detail below ~24px: the flow lines and dots eat a
 * third of the width and turn to mush. For those sizes we crop to the document,
 * which still reads as the logo. Fractions are of the trimmed bounding box.
 */
const COMPACT_CROP = { left: 0.4, top: 0.2, width: 0.6, height: 0.8 };

async function trimmedSource(crop) {
  const base = await sharp(SOURCE).trim({ threshold: 10 }).png().toBuffer();
  if (!crop) return base;

  const { width, height } = await sharp(base).metadata();
  return sharp(base)
    .extract({
      left: Math.round(crop.left * width),
      top: Math.round(crop.top * height),
      width: Math.round(crop.width * width),
      height: Math.round(crop.height * height),
    })
    .trim({ threshold: 10 })
    .png()
    .toBuffer();
}

/**
 * The logo ships with uneven transparent padding. Trim it away and re-centre the
 * mark on a square canvas so every derived icon is optically identical.
 *
 * @param {number} size    edge of the output square
 * @param {number} inset   fraction of the edge left as margin on each side
 * @param {string|null} bg background colour, or null for transparent
 * @param {object|null} crop sub-region of the mark to use instead of the whole thing
 */
async function mark(size, inset, bg = null, crop = null) {
  const content = Math.round(size * (1 - inset * 2));
  const trimmed = await sharp(await trimmedSource(crop))
    .resize(content, content, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmed, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Packs PNG buffers into a multi-resolution .ico (PNG payloads, universally supported). */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    dir.push(entry);
  }

  return Buffer.concat([header, ...dir, ...entries.map((e) => e.data)]);
}

/** 1200x630 social card: the mark, the name, the pitch. */
async function socialCard() {
  const W = 1200;
  const H = 630;

  const backdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="glow" cx="18%" cy="12%" r="72%">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="88%" cy="96%" r="60%">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${TEAL}"/>
</svg>`);

  const copy = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .name { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 82px; font-weight: 700; letter-spacing: -2px; fill: #0a0a0a; }
    .tag  { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 34px; font-weight: 400; fill: #52525b; }
    .meta { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 26px; font-weight: 600; letter-spacing: 3px; fill: ${TEAL}; }
  </style>
  <text class="meta" x="360" y="196">MAGIC FORMS</text>
  <text class="name" x="360" y="300">Forms your whole</text>
  <text class="name" x="360" y="386">company can ship.</text>
  <text class="tag" x="360" y="452">Multi-step forms, shareable links, webhooks.</text>
</svg>`);

  const logo = await sharp(SOURCE)
    .trim({ threshold: 10 })
    .resize(232, 232, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp(backdrop)
    .composite([
      { input: logo, top: 199, left: 92 },
      { input: copy, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(out("public", "icons"), { recursive: true });

  const written = [];
  const write = async (rel, data) => {
    await writeFile(out(...rel), data);
    written.push([rel.join("/"), data.length]);
  };

  // Browser tab icon. 16px gets the document-only crop, the rest the full mark.
  await write(
    ["app", "favicon.ico"],
    ico([
      { size: 16, data: await mark(16, 0.02, null, COMPACT_CROP) },
      { size: 32, data: await mark(32, 0.02) },
      { size: 48, data: await mark(48, 0.02) },
    ]),
  );

  // Next.js file conventions — picked up automatically by the app router.
  await write(["app", "icon.png"], await mark(512, 0.04));
  await write(["app", "apple-icon.png"], await mark(180, 0.12, WHITE)); // iOS ignores alpha
  const card = await socialCard();
  await write(["app", "opengraph-image.png"], card);
  await write(["app", "twitter-image.png"], card);

  // Web app manifest icons (see app/manifest.ts).
  await write(["public", "icons", "icon-192.png"], await mark(192, 0.04));
  await write(["public", "icons", "icon-512.png"], await mark(512, 0.04));
  // Maskable icons get cropped to a platform shape: keep the mark inside the safe zone.
  await write(["public", "icons", "icon-maskable-512.png"], await mark(512, 0.2, WHITE));

  // Square, trimmed mark for in-product UI (<Logo />).
  await write(["public", "images", "logo-mark.png"], await mark(512, 0.02));

  for (const [rel, bytes] of written) {
    console.log(`${rel.padEnd(38)} ${(bytes / 1024).toFixed(1)} KB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
