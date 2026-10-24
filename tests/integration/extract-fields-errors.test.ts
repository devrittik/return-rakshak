import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extract-fields/route";
import type { AiExtractionResult, AiProvider } from "@/lib/ai/types";

const state = vi.hoisted(() => ({
  result: { ok: false, code: "timeout", message: "slow" } as AiExtractionResult,
}));

vi.mock("@/lib/ai", () => ({
  getAiProvider: (): AiProvider => ({
    name: "openai-compatible",
    model: "qwen-test",
    extractFields: async () => state.result,
  }),
}));

const INVOICE = "CONFIDENTIAL-TOKEN-9f3a Seller: Shop Product: Lamp Total: INR 10";

const post = () =>
  POST(
    new Request("http://localhost/api/extract-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: INVOICE }),
    }),
  );

afterEach(() => {
  state.result = { ok: false, code: "timeout", message: "slow" };
});

describe("POST /api/extract-fields provider failures", () => {
  it.each([
    ["timeout", 504, "took too long"],
    ["unavailable", 503, "unavailable"],
    ["not_configured", 503, "No model endpoint"],
    ["malformed_json", 422, "valid JSON"],
    ["invalid_output", 422, "couldn't trust"],
  ] as const)("maps %s to a manual-entry message", async (code, status, snippet) => {
    state.result = {
      ok: false,
      code,
      message: `provider blew up and quoted ${INVOICE}`,
      issues: [`price: ${INVOICE}`],
    };
    const response = await post();
    const body = (await response.json()) as { error: string; issues?: string[] };
    expect(response.status).toBe(status);
    expect(body.error).toMatch(new RegExp(snippet, "i"));
    expect(body.error).toMatch(/manually/i);
    expect(JSON.stringify(body)).not.toContain("CONFIDENTIAL-TOKEN-9f3a");
    expect(body.issues).toBeUndefined();
  });
});
