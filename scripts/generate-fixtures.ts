/**
 * Generates fully synthetic invoice fixtures — invented seller, product and
 * amounts. No real document is ever used for testing.
 *
 * Everything is produced in-process so the fixtures are reproducible:
 *   fixtures/invoice-text.pdf   text layer present  → native extraction path
 *   fixtures/invoice-scan.pdf   image-only PDF      → OCR fallback path
 *   fixtures/invoice-scan.png   raster invoice      → OCR path
 *   fixtures/malformed.pdf      PDF header, junk payload → rejected
 *   fixtures/mislabelled.pdf    PNG bytes named .pdf → rejected (content mismatch)
 *   fixtures/invoice.txt        wrong extension      → rejected
 *
 * Run: npm run fixtures
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const OUT = "fixtures";

const invoiceLines = [
  "TAX INVOICE",
  "Seller: SonicWave Electronics",
  "Buyer: Sample Buyer",
  "Product: Aurora ANC Headphones",
  "Purchase date: 2026-10-11",
  "Invoice no: SW-000123",
  "Total: INR 8499.00",
  "Return accepted within 15 days of delivery.",
  "Warranty: 24 months manufacturer warranty.",
];

// ── Minimal PDF writer (enough for a single page of text) ────────────────────
function textPdf(lines: string[]): Buffer {
  const stream = [
    "BT",
    "/F1 12 Tf",
    "56 780 Td",
    "16 TL",
    ...lines.map((line) => `(${line.replace(/([()\\])/g, "\\$1")}) Tj T*`),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function invoicePng(): Promise<Buffer> {
  const canvas = createCanvas(1000, 1300);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111111";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(invoiceLines[0] ?? "", 70, 110);
  ctx.font = "26px sans-serif";
  invoiceLines.slice(1).forEach((line, index) => {
    ctx.fillText(line, 70, 190 + index * 52);
  });
  ctx.strokeStyle = "#cccccc";
  ctx.beginPath();
  ctx.moveTo(70, 150);
  ctx.lineTo(930, 150);
  ctx.stroke();
  return canvas.toBuffer("image/png");
}

/** Wraps a PNG into a single-page PDF with no text layer — pure raster. */
function imagePdf(png: Buffer, width: number, height: number): Buffer {
  const image = png;
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`;
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    ),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    // The PNG's IDAT payload is zlib data; wrapping it in FlateDecode with a
    // luminance colour space keeps the fixture small and renderable.
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`,
      ),
      image,
      Buffer.from("\nendstream"),
    ]),
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let length = chunks[0]!.length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xrefStart = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

/** Re-encodes the PNG as raw RGB + Flate so pdfjs can render it. */
async function rasterPdf(width = 1000, height = 1300): Promise<Buffer> {
  const png = await invoicePng();
  const image = await loadImage(png);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i] ?? 0;
    rgb[j + 1] = rgba[i + 1] ?? 0;
    rgb[j + 2] = rgba[i + 2] ?? 0;
  }
  const deflated = deflateSync(rgb);

  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`;
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    ),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${deflated.length} >>\nstream\n`,
      ),
      deflated,
      Buffer.from("\nendstream"),
    ]),
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let length = chunks[0]!.length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xrefStart = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const png = await invoicePng();
  await writeFile(`${OUT}/invoice-text.pdf`, textPdf(invoiceLines));
  await writeFile(`${OUT}/invoice-scan.png`, png);
  await writeFile(`${OUT}/invoice-scan.pdf`, await rasterPdf());
  await writeFile(`${OUT}/malformed.pdf`, Buffer.from("%PDF-1.7\nthis is not really a pdf\n%%EOF"));
  await writeFile(`${OUT}/mislabelled.pdf`, png);
  await writeFile(`${OUT}/invoice.txt`, "Seller: plain text, not an invoice file");
  void imagePdf;

  console.log("✔ fixtures written to ./fixtures (synthetic only)");
}

main().catch((error) => {
  console.error("✖ fixture generation failed:", error);
  process.exit(1);
});
