// Writes public/assets/qr/live-endpoint.png for the live endpoint in src/data/links.json and decodes it back.
//
//   node scripts/make-qr.mjs
//
// Error correction M, navy on white, generated offline with the qrcode package; jsQR must read back the exact URL.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import QRCode from "qrcode";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const links = JSON.parse(fs.readFileSync(path.join(videoRoot, "src", "data", "links.json"), "utf8"));
const outFile = path.join(videoRoot, "public", "assets", "qr", "live-endpoint.png");

export function decodeQr(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await QRCode.toFile(outFile, links.endpoint.url, { errorCorrectionLevel: "M", margin: 2, scale: 16, color: { dark: "#0B1730", light: "#FFFFFF" } });
  const decoded = decodeQr(outFile);
  if (decoded !== links.endpoint.url) {
    console.error(`QR decodes to ${decoded}, expected ${links.endpoint.url}`);
    process.exit(1);
  }
  console.log(`wrote ${path.relative(videoRoot, outFile)} → ${decoded}`);
}
