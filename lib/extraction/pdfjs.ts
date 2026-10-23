import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

/**
 * PDF.js in Node.
 *
 * Two non-obvious requirements, both discovered by testing:
 *  1. Path2D / DOMMatrix / ImageData must exist on globalThis *before* pdfjs
 *     loads, otherwise vector paths fall back to a broken polyfill.
 *  2. Rendering an image-only PDF needs an explicit CanvasFactory. Without it
 *     pdfjs hands @napi-rs/canvas an object it treats as a fill rule and the
 *     process segfaults.
 */
function installGlobals() {
  // The DOM globals and the @napi-rs/canvas classes are structurally compatible
  // at runtime but not in TypeScript, hence the deliberate casts.
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.Path2D ??= Path2D;
  scope.DOMMatrix ??= DOMMatrix;
  scope.ImageData ??= ImageData;
}

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.max(1, width), Math.max(1, height));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(target: { canvas: unknown }, width: number, height: number) {
    const canvas = target.canvas as ReturnType<typeof createCanvas>;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
  }
  destroy(target: { canvas: unknown; context?: unknown }) {
    const canvas = target.canvas as ReturnType<typeof createCanvas>;
    canvas.width = 0;
    canvas.height = 0;
    target.context = null;
  }
}

/** Resolves pdfjs's bundled standard fonts so rendering doesn't warn/log. */
async function standardFontDataUrl(): Promise<string | undefined> {
  try {
    const { createRequire } = await import("node:module");
    const requireFromHere = createRequire(import.meta.url);
    const entry = requireFromHere.resolve("pdfjs-dist/package.json");
    return `${entry.slice(0, entry.lastIndexOf("/"))}/standard_fonts/`;
  } catch {
    return undefined;
  }
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  installGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Copy the buffer: pdfjs may transfer/detach the underlying memory.
  const data = new Uint8Array(bytes);
  return pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    // 0 = errors only. Warnings would otherwise print document details to logs.
    verbosity: 0,
    standardFontDataUrl: await standardFontDataUrl(),
    CanvasFactory: NodeCanvasFactory,
  }).promise;
}

export type { PDFPageProxy };
export { createCanvas };
