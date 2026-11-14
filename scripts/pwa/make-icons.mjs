// Makes the app icons the phone's home screen needs, with no image library: node scripts/pwa/make-icons.mjs
// A plain "P" on the planner's dark tile, the same mark as the sidebar. Replace public/icons/*.png with real
// artwork at the same sizes whenever there is some; nothing else has to change.
import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "icons")
const BG = [38, 38, 38], FG = [245, 245, 245]

// The mark, in a 0..1 square: a stem, and a bowl made of two bars and a half ring.
function inMark(x, y) {
  if (x >= 0.34 && x <= 0.45 && y >= 0.26 && y <= 0.74) return true
  if (x >= 0.45 && x <= 0.53 && ((y >= 0.26 && y <= 0.35) || (y >= 0.47 && y <= 0.56))) return true
  if (x >= 0.53) { const d = Math.hypot(x - 0.53, y - 0.41); return d <= 0.15 && d >= 0.06 }
  return false
}
function inTile(x, y, radius) {
  if (radius === 0) return true
  const cx = Math.min(Math.max(x, radius), 1 - radius), cy = Math.min(Math.max(y, radius), 1 - radius)
  return Math.hypot(x - cx, y - cy) <= radius
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]) }

/** size in pixels; radius of the tile's corners (0 = full square); scale of the mark inside the tile. */
function png(size, radius, scale) {
  const S = 4, raw = Buffer.alloc(size * (size * 4 + 1))
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let tile = 0, mark = 0
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const x = (px + (sx + 0.5) / S) / size, y = (py + (sy + 0.5) / S) / size
        if (!inTile(x, y, radius)) continue
        tile++
        if (inMark((x - 0.5) / scale + 0.5, (y - 0.5) / scale + 0.5)) mark++
      }
      const a = tile / (S * S), m = tile ? mark / tile : 0, o = py * (size * 4 + 1) + 1 + px * 4
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(BG[k] + (FG[k] - BG[k]) * m)
      raw[o + 3] = Math.round(a * 255)
    }
  }
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))])
}

mkdirSync(out, { recursive: true })
const files = [
  ["icon-192.png", 192, 0.22, 1],
  ["icon-512.png", 512, 0.22, 1],
  // Maskable: the system crops it to a circle or squircle, so the tile is a full square and the mark stays in the middle 80%.
  ["icon-maskable-512.png", 512, 0, 0.72],
  // iOS adds its own corners and wants no transparency.
  ["apple-touch-icon.png", 180, 0, 0.9],
]
for (const [name, size, radius, scale] of files) { const buf = png(size, radius, scale); writeFileSync(join(out, name), buf); console.log(name, `${size}x${size}`, buf.length, "bytes") }
