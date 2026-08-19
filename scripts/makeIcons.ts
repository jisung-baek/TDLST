/**
 * PWA 아이콘 생성기.
 *
 * sharp / canvas 같은 무거운 의존성을 들이지 않으려고 PNG 를 직접 인코딩한다.
 * 실행: node --experimental-strip-types scripts/makeIcons.ts
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

type RGBA = [number, number, number, number]

const BG: RGBA = [21, 23, 29, 255]
const ACCENT: RGBA = [91, 156, 255, 255]
const INK: RGBA = [232, 234, 240, 255]

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const body = new Uint8Array(typeBytes.length + data.length)
  body.set(typeBytes, 0)
  body.set(data, typeBytes.length)

  const out = new Uint8Array(8 + data.length + 4)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(body, 4)
  view.setUint32(4 + body.length, crc32(body))
  return out
}

function encodePNG(size: number, pixels: Uint8Array): Uint8Array {
  // 각 스캔라인 앞에 필터 바이트(0 = None)를 붙인다
  const stride = size * 4
  const raw = new Uint8Array((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }

  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, size)
  hv.setUint32(4, size)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** 점과 선분 사이 거리. 체크마크를 두꺼운 선으로 그리는 데 쓴다. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** 둥근 사각형 내부까지의 부호 거리 (음수면 내부) */
function roundedRectSDF(px: number, py: number, half: number, radius: number) {
  const qx = Math.abs(px) - half + radius
  const qy = Math.abs(py) - half + radius
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

function blend(dst: RGBA, src: RGBA, alpha: number): RGBA {
  const a = alpha * (src[3] / 255)
  return [
    Math.round(dst[0] * (1 - a) + src[0] * a),
    Math.round(dst[1] * (1 - a) + src[1] * a),
    Math.round(dst[2] * (1 - a) + src[2] * a),
    Math.round(Math.min(255, dst[3] * (1 - a) + 255 * a)),
  ]
}

/** 경계에서 1px 만큼 부드럽게 깎는다 */
const coverage = (sdf: number, feather: number) =>
  Math.max(0, Math.min(1, 0.5 - sdf / feather))

function render(size: number, maskable: boolean): Uint8Array {
  const px = new Uint8Array(size * size * 4)
  const c = size / 2
  const feather = 1.5

  // maskable 아이콘은 바깥 10% 가 잘려나갈 수 있으므로 내용을 안쪽으로 모은다
  const plateHalf = maskable ? size * 0.5 : size * 0.44
  const plateRadius = maskable ? 0 : size * 0.115
  const scale = maskable ? 0.8 : 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x + 0.5 - c
      const fy = y + 0.5 - c
      let color: RGBA = [0, 0, 0, 0]

      const plate = roundedRectSDF(fx, fy, plateHalf, plateRadius)
      color = blend(color, BG, coverage(plate, feather))

      // 상단 띠 — 달력의 머리 부분
      const bandTop = -size * 0.2 * scale
      const bandBottom = -size * 0.115 * scale
      if (plate < 0 && fy > bandTop && fy < bandBottom) {
        const edge = Math.min(fy - bandTop, bandBottom - fy)
        color = blend(color, ACCENT, Math.min(1, edge / feather + 0.5))
      }

      // 체크마크
      const s = size * scale
      const d = Math.min(
        distToSegment(fx, fy, -0.2 * s, 0.03 * s, -0.05 * s, 0.18 * s),
        distToSegment(fx, fy, -0.05 * s, 0.18 * s, 0.21 * s, -0.14 * s),
      )
      const strokeHalf = size * 0.045 * scale
      color = blend(color, INK, coverage(d - strokeHalf, feather))

      const o = (y * size + x) * 4
      px[o] = color[0]
      px[o + 1] = color[1]
      px[o + 2] = color[2]
      px[o + 3] = color[3]
    }
  }
  return encodePNG(size, px)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
] as const) {
  const bytes = render(size, maskable)
  writeFileSync(join(OUT_DIR, name), bytes)
  console.log(`  ${name.padEnd(24)} ${size}x${size}  ${(bytes.length / 1024).toFixed(1)} KB`)
}
console.log('\nicons written to public/icons/')
