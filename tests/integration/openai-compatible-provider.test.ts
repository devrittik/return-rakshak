import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiProvider, OpenAiCompatibleProvider } from "@/lib/ai";
import type { OpenAiCompatibleOptions } from "@/lib/ai/openai-compatible";
import { resetEnvCache } from "@/lib/env";

const SECRET = "CONFIDENTIAL-TOKEN-9f3a";
const INVOICE = `TAX INVOICE ${SECRET}
Seller: SonicWave Electronics
Product: Aurora ANC Headphones
Purchase date: 2026-10-11
Total: INR 8499.00
Warranty: 24 months from the date of purchase.`;

const ENV_KEYS = ["AI_PROVIDER", "AI_BASE_URL", "AI_MODEL", "AI_API_KEY", "AI_TIMEOUT_MS"] as const;

function sampleExtraction() {
  return {
    productName: { value: "Aurora ANC Headphones", provenance: "invoice", confidence: "high", evidence: "Product: Aurora ANC Headphones" },
    seller: { value: "SonicWave Electronics", provenance: "invoice", confidence: "high", evidence: null },
    purchaseDate: { value: "2026-10-11", provenance: "invoice", confidence: "high", evidence: null },
    price: { value: 849900, provenance: "invoice", confidence: "high", evidence: null },
    currency: { value: "INR", provenance: "invoice", confidence: "high", evidence: null },
    returnPolicy: {
      durationValue: null,
      durationUnit: null,
      startBasis: "unknown",
      evidence: null,
      provenance: "missing",
      confidence: "low",
    },
    warranty: {
      durationValue: 24,
      durationUnit: "months",
      startBasis: "purchase_date",
      evidence: "24 months from the date of purchase",
      provenance: "invoice",
      confidence: "high",
    },
    missingFields: ["returnPolicy"],
    uncertaintyNotes: [],
  };
}

function chat(content: unknown) {
  return JSON.stringify({ choices: [{ message: { role: "assistant", content } }] });
}

interface Captured {
  url: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown>;
}

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

function startServer(
  respond: (captured: Captured, res: ServerResponse) => void,
): Promise<{ url: string; hits: Captured[] }> {
  const hits: Captured[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        body = { raw };
      }
      const captured = { url: req.url ?? "", headers: req.headers, body };
      hits.push(captured);
      respond(captured, res);
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      closers.push(
        () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      );
      resolve({ url: `http://127.0.0.1:${port}/v1`, hits });
    });
  });
}

function provider(baseUrl: string | undefined, options: Partial<OpenAiCompatibleOptions> = {}) {
  return new OpenAiCompatibleProvider({
    baseUrl,
    model: "qwen-test",
    timeoutMs: 2_000,
    ...options,
  });
}

function json(res: ServerResponse, status: number, payload: unknown) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

describe("OpenAiCompatibleProvider", () => {
  it("posts a json-mode chat completion and returns the validated proposal", async () => {
    const server = await startServer((_captured, res) => {
      json(res, 200, JSON.parse(chat(JSON.stringify(sampleExtraction()))));
    });

    const result = await provider(server.url).extractFields({ text: INVOICE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.productName.value).toBe("Aurora ANC Headphones");
    expect(result.data.price.value).toBe(849900);
    expect(result.data.warranty.startBasis).toBe("purchase_date");
    expect(result.meta).toMatchObject({ provider: "openai-compatible", model: "qwen-test" });
    expect(JSON.stringify(result)).not.toContain(SECRET);

    expect(server.hits).toHaveLength(1);
    const hit = server.hits[0]!;
    expect(hit.url).toBe("/v1/chat/completions");
    expect(hit.headers.authorization).toBeUndefined();
    expect(hit.body.model).toBe("qwen-test");
    expect(hit.body.temperature).toBe(0);
    expect(hit.body.stream).toBe(false);
    expect(hit.body.response_format).toEqual({ type: "json_object" });

    const messages = hit.body.messages as { role: string; content: string }[];
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("Never invent");
    expect(messages[0]?.content).not.toContain(SECRET);
    expect(messages[1]?.content).toContain(SECRET);
  });

  it("does not double the chat path when the base URL already includes it", async () => {
    const server = await startServer((_captured, res) => {
      json(res, 200, JSON.parse(chat(JSON.stringify(sampleExtraction()))));
    });
    const result = await provider(`${server.url}/chat/completions`).extractFields({ text: INVOICE });
    expect(result.ok).toBe(true);
    expect(server.hits[0]?.url).toBe("/v1/chat/completions");
  });

  it("sends the bearer token and never returns it", async () => {
    const server = await startServer((_captured, res) => {
      json(res, 200, JSON.parse(chat(JSON.stringify(sampleExtraction()))));
    });
    const result = await provider(server.url, { apiKey: "super-secret-key" }).extractFields({ text: INVOICE });
    expect(server.hits[0]?.headers.authorization).toBe("Bearer super-secret-key");
    expect(JSON.stringify(result)).not.toContain("super-secret-key");
  });

  it("recovers JSON wrapped in a markdown fence", async () => {
    const fenced = "```json\n" + JSON.stringify(sampleExtraction()) + "\n```";
    const server = await startServer((_captured, res) => json(res, 200, JSON.parse(chat(fenced))));
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.seller.value).toBe("SonicWave Electronics");
  });

  it("recovers a JSON object that follows a preamble", async () => {
    const prose = `Here is the extraction:\n${JSON.stringify(sampleExtraction())}\nLet me know if you need more.`;
    const server = await startServer((_captured, res) => json(res, 200, JSON.parse(chat(prose))));
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result.ok).toBe(true);
  });

  it("recovers a double-encoded JSON string", async () => {
    const server = await startServer((_captured, res) => {
      json(res, 200, JSON.parse(chat(JSON.stringify(JSON.stringify(sampleExtraction())))));
    });
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.currency.value).toBe("INR");
  });

  it("unwraps a single nested extraction object", async () => {
    const server = await startServer((_captured, res) => {
      json(res, 200, JSON.parse(chat(JSON.stringify({ data: sampleExtraction() }))));
    });
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result.ok).toBe(true);
  });

  it("reads content delivered as an array of text parts", async () => {
    const server = await startServer((_captured, res) => {
      json(res, 200, {
        choices: [{ message: { content: [{ type: "text", text: JSON.stringify(sampleExtraction()) }] } }],
      });
    });
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result.ok).toBe(true);
  });

  it("returns malformed_json when the reply is not JSON, without echoing the invoice", async () => {
    const server = await startServer((_captured, res) => json(res, 200, JSON.parse(chat("I cannot help with that."))));
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result).toMatchObject({ ok: false, code: "malformed_json" });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("returns invalid_output for a schema miss, and the issues do not quote the invoice", async () => {
    const broken = sampleExtraction();
    broken.purchaseDate = { value: SECRET, provenance: "invoice", confidence: "high", evidence: null };
    const server = await startServer((_captured, res) => json(res, 200, JSON.parse(chat(JSON.stringify(broken)))));
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_output");
    expect(result.issues?.join(" ")).toMatch(/purchaseDate/);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("rejects a response that lists a present field as missing", async () => {
    const broken = sampleExtraction();
    broken.missingFields = ["productName", "returnPolicy"];
    const server = await startServer((_captured, res) => json(res, 200, JSON.parse(chat(JSON.stringify(broken)))));
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result).toMatchObject({ ok: false, code: "invalid_output" });
    if (!result.ok) expect(result.issues?.join(" ")).toMatch(/productName has a value/);
  });

  it("retries once without json mode when the server rejects response_format", async () => {
    let calls = 0;
    const server = await startServer((captured, res) => {
      calls += 1;
      if (calls === 1) {
        json(res, 400, { error: "response_format is not supported" });
        return;
      }
      expect(captured.body.response_format).toBeUndefined();
      json(res, 200, JSON.parse(chat(JSON.stringify(sampleExtraction()))));
    });
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result.ok).toBe(true);
    expect(server.hits).toHaveLength(2);
    expect(server.hits[0]?.body.response_format).toEqual({ type: "json_object" });
  });

  it("does not retry a 400 that is unrelated to json mode", async () => {
    const server = await startServer((_captured, res) => json(res, 400, { error: "model not found" }));
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(server.hits).toHaveLength(1);
  });

  it("times out when the endpoint never answers", async () => {
    const server = await startServer(() => {
      // Hold the socket open until the client aborts.
    });
    const result = await provider(server.url, { timeoutMs: 200 }).extractFields({ text: INVOICE });
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("reports unavailable when nothing is listening", async () => {
    const server = await startServer((_captured, res) => json(res, 200, {}));
    const url = server.url;
    await closers.splice(0).reduce((chain, close) => chain.then(() => close()), Promise.resolve());
    const result = await provider(url, { timeoutMs: 1_000 }).extractFields({ text: INVOICE });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("reports unavailable on HTTP 503", async () => {
    const server = await startServer((_captured, res) => json(res, 503, { error: "overloaded" }));
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("does not follow a redirect with the invoice text", async () => {
    const sink = await startServer((_captured, res) => json(res, 200, JSON.parse(chat(JSON.stringify(sampleExtraction())))));
    const server = await startServer((_captured, res) => {
      res.writeHead(302, { Location: `${sink.url}/chat/completions` });
      res.end();
    });
    const result = await provider(server.url).extractFields({ text: INVOICE });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(sink.hits).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("does not call the network when the endpoint is not configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const missing = await provider(undefined, { fetchImpl, model: "" }).extractFields({ text: INVOICE });
    const embedded = await provider("http://user:pass@127.0.0.1:9/v1", { fetchImpl }).extractFields({ text: INVOICE });
    const ftp = await provider("ftp://127.0.0.1/v1", { fetchImpl }).extractFields({ text: INVOICE });
    const short = await provider("http://127.0.0.1:9/v1", { fetchImpl }).extractFields({ text: "too short" });

    expect(missing).toMatchObject({ ok: false, code: "not_configured" });
    expect(embedded).toMatchObject({ ok: false, code: "not_configured" });
    expect(ftp).toMatchObject({ ok: false, code: "not_configured" });
    expect(short).toMatchObject({ ok: false, code: "invalid_output" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(embedded)).not.toContain("pass");
  });

  it("logs the outcome only — never the invoice, the prompt, or the reply", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const server = await startServer((_captured, res) => json(res, 200, JSON.parse(chat("not json at all"))));
    try {
      await provider(server.url).extractFields({ text: INVOICE });
    } finally {
      spy.mockRestore();
    }
    const output = lines.join("\n");
    expect(output).toContain("ai.provider_finished");
    expect(output).toContain("malformed_json");
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain("Aurora");
    expect(output).not.toContain("Never invent");
  });
});

describe("getAiProvider selection", () => {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
  });

  it("uses the open-weight adapter when configured, and the mock otherwise", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;
    delete process.env.AI_API_KEY;
    resetEnvCache();

    const unconfigured = await getAiProvider().extractFields({ text: INVOICE });
    expect(getAiProvider().name).toBe("openai-compatible");
    expect(unconfigured).toMatchObject({ ok: false, code: "not_configured" });

    process.env.AI_PROVIDER = "mock";
    resetEnvCache();
    expect(getAiProvider().name).toBe("mock");
    const mocked = await getAiProvider().extractFields({ text: INVOICE });
    expect(mocked.ok).toBe(true);
    if (mocked.ok) expect(mocked.meta.provider).toBe("mock");
  });
});
