// Minimal PNG encoder for RGBA data (uncompressed deflate, no deps).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Encode raw RGBA pixels as a base64 PNG (uncompressed, valid everywhere). */
export function encodePngFromRgba(rgba: Uint8ClampedArray, width: number, height: number): string {
  // raw scanlines with filter byte 0
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1)
  }

  // stored (uncompressed) deflate blocks
  const blocks: number[] = []
  const CHUNK = 65535
  for (let i = 0; i < raw.length; i += CHUNK) {
    const part = raw.subarray(i, Math.min(i + CHUNK, raw.length))
    const last = i + CHUNK >= raw.length
    blocks.push(last ? 1 : 0, part.length & 0xff, (part.length >> 8) & 0xff, (~part.length & 0xff), ((~part.length >> 8) & 0xff))
    blocks.push(...part)
  }
  const adler = (() => {
    let a = 1
    let b = 0
    for (const byte of raw) {
      a = (a + byte) % 65521
      b = (b + a) % 65521
    }
    return ((b << 16) | a) >>> 0
  })()
  const adlerBuf = new Uint8Array([(adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff])
  const zdata = new Uint8Array([0x78, 0x01, ...blocks, ...adlerBuf])

  const ihdr = new Uint8Array(13)
  const iv = new DataView(ihdr.buffer)
  iv.setUint32(0, width)
  iv.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const png = new Uint8Array([
    ...sig,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zdata),
    ...chunk('IEND', new Uint8Array(0))
  ])

  let bin = ''
  for (const b of png) bin += String.fromCharCode(b)
  return btoa(bin)
}
