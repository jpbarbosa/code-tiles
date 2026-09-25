'use strict';

// A PNG's pHYs chunk counts pixels per metre, and macOS writes 144 dpi into every Retina
// screenshot, on the clipboard as in a file - so an image says for itself that it is 2x.
const PIXELS_PER_METRE_AT_1X = 72 / 0.0254;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEADER_BYTES = 65536;

// The model counts one token per 28px square. A capture that costs less than this at full size is
// the small crop pasted to ask about a pixel, and halving it saves next to nothing: of 74
// screenshots pasted into the chat in four days, the 20 under it held 3% of what halving saved.
const FLOOR = 500;
const tokensFor = (width, height) => Math.ceil(width / 28) * Math.ceil(height / 28);

function headerOf(bytes) {
  if (bytes.length < 33 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = { width: view.getUint32(16), height: view.getUint32(20), scale: 1 };
  // pHYs must come before the first IDAT, so the walk ends there, however long the chunks before.
  for (let offset = 8; offset + 8 <= bytes.length; offset += 12 + view.getUint32(offset)) {
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') break;
    if (type !== 'pHYs' || offset + 17 > bytes.length || bytes[offset + 16] !== 1) continue;
    const across = view.getUint32(offset + 8);
    if (across === view.getUint32(offset + 12)) header.scale = Math.round(across / PIXELS_PER_METRE_AT_1X);
  }
  return header;
}

// The size a PNG is sent at, from its first HEADER_BYTES alone: its 1x size when it says it is a
// Retina capture worth halving, and null for everything else, which goes through as it came.
function targetOf(bytes) {
  const header = headerOf(bytes);
  if (!header || header.scale < 2 || tokensFor(header.width, header.height) < FLOOR) return null;
  const { width, height, scale } = header;
  return { width: Math.round(width / scale), height: Math.round(height / scale), from: { width, height } };
}

module.exports = { HEADER_BYTES, targetOf };
