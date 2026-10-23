import { log } from "@/lib/logger";

/**
 * OCR is an injectable interface so tests never need a real engine, and so a
 * different engine can be swapped in without touching the pipeline.
 */
export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrEngine {
  recognize(image: Uint8Array): Promise<OcrResult>;
  dispose(): Promise<void>;
}

export class OcrUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`OCR unavailable: ${reason}`);
    this.name = "OcrUnavailableError";
  }
}

export interface TesseractOptions {
  languages?: string;
  cachePath?: string;
}

/**
 * Tesseract.js engine, loaded lazily so importing the pipeline stays cheap.
 * Language data is cached on disk; the first run needs network access unless a
 * cache is pre-seeded. No model weights are fetched by the application itself.
 */
export async function createTesseractEngine(options: TesseractOptions = {}): Promise<OcrEngine> {
  const languages = options.languages ?? process.env.TESSERACT_LANG ?? "eng";
  const cachePath = options.cachePath ?? process.env.TESSERACT_CACHE_PATH ?? "./data/tesseract-cache";

  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker(languages, 1, { cachePath, logger: () => {} });
  } catch (error) {
    log.warn("ocr.unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    throw new OcrUnavailableError("engine could not start");
  }

  let disposed = false;
  return {
    async recognize(image) {
      const { data } = await worker.recognize(Buffer.from(image));
      return { text: data.text ?? "", confidence: data.confidence ?? 0 };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await worker.terminate().catch(() => undefined);
    },
  };
}
