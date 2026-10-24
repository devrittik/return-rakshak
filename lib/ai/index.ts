import { env } from "@/lib/env";
import { MockAiProvider } from "./mock";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import type { AiProvider } from "./types";

/**
 * Provider selection happens here and nowhere else.
 *
 * `mock` is the default: no model, no network, no key. `openai-compatible`
 * calls the endpoint in `AI_BASE_URL`. A missing URL or model name does not
 * silently switch back to the mock — that would hide a broken configuration.
 * The request fails as `not_configured`, and manual entry stays available.
 */
export function getAiProvider(): AiProvider {
  const config = env();
  if (config.AI_PROVIDER === "openai-compatible") {
    return new OpenAiCompatibleProvider({
      baseUrl: config.AI_BASE_URL,
      model: config.AI_MODEL,
      apiKey: config.AI_API_KEY,
      timeoutMs: config.AI_TIMEOUT_MS,
    });
  }
  return new MockAiProvider();
}

export { MockAiProvider, OpenAiCompatibleProvider };
export * from "./schema";
export type { AiProvider, AiExtractionResult, AiFailureCode } from "./types";
