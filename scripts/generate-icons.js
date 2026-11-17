const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function makePng(width, height, r, g, b, isBadge = false) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4);
    const buf = Buffer.concat([t, data]);
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = chunk("IHDR", ihdr);

  const rawRows = [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const offset = 1 + x * 4;

      if (dist < radius) {
        // Antialiased edge
        const alpha = Math.min(1, Math.max(0, radius - dist + 0.5));
        row[offset] = r;
        row[offset + 1] = g;
        row[offset + 2] = b;
        row[offset + 3] = Math.round(alpha * 255);
      } else {
        row[offset] = 0;
        row[offset + 1] = 0;
        row[offset + 2] = 0;
        row[offset + 3] = 0;
      }
    }
    rawRows.push(row);
  }

  const idatData = zlib.deflateSync(Buffer.concat(rawRows));
  const idatChunk = chunk("IDAT", idatData);
  const iendChunk = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const pubDir = path.join(__dirname, "..", "public");
fs.writeFileSync(path.join(pubDir, "icon-192.png"), makePng(192, 192, 124, 58, 237));
fs.writeFileSync(path.join(pubDir, "icon-512.png"), makePng(512, 512, 124, 58, 237));
fs.writeFileSync(path.join(pubDir, "badge-72.png"), makePng(72, 72, 124, 58, 237, true));
fs.writeFileSync(path.join(pubDir, "favicon.ico"), makePng(64, 64, 124, 58, 237));

console.log("Successfully generated public notification icons!");
