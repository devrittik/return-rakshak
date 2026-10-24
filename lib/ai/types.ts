import type { ExtractionModel } from "./schema";

/** Provider-agnostic failure codes, mapped to HTTP statuses by the route. */
export type AiFailureCode = "timeout" | "unavailable" | "invalid_output" | "malformed_json" | "not_configured";

export type AiExtractionResult =
  | {
      ok: true;
      data: ExtractionModel;
      meta: { provider: string; model: string; durationMs: number };
    }
  | {
      ok: false;
      code: AiFailureCode;
      message: string;
      /** Validation detail, safe to show: field names and rule violations only. */
      issues?: string[];
    };

export interface AiExtractInput {
  /** Extracted invoice text. Used for exactly one call, then dropped. */
  text: string;
}

/**
 * Every provider implements this. Swapping a local llama.cpp endpoint for the
 * offline mock must never require touching business logic.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  extractFields(input: AiExtractInput): Promise<AiExtractionResult>;
}
