import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extract-fields/route";

const invoiceText = `TAX INVOICE
Seller: SonicWave Electronics
Product: Aurora ANC Headphones
Purchase date: 2026-10-11
Total: INR 8499.00
Return accepted within 15 days of delivery.
Warranty: 24 months manufacturer warranty.`;

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/extract-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/extract-fields", () => {
  it("returns proposed fields without persisting anything", async () => {
    const response = await post({ text: invoiceText });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = (await response.json()) as {
      ok: boolean;
      provider: string;
      data: { productName: { value: string }; returnPolicy: { durationValue: number } };
    };
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("mock");
    expect(body.data.productName.value).toBe("Aurora ANC Headphones");
    expect(body.data.returnPolicy.durationValue).toBe(15);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await post("this is not json{");
    expect(response.status).toBe(400);
  });

  it("rejects missing or too-short text", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ text: "tiny" })).status).toBe(400);
  });

  it("rejects text beyond the length cap", async () => {
    const response = await post({ text: "a".repeat(200_001) });
    expect(response.status).toBe(413);
  });

  it("never echoes the invoice text back in an error", async () => {
    const response = await post({ text: "x".repeat(50) });
    const body = (await response.json()) as { error?: string };
    expect(JSON.stringify(body)).not.toContain("xxxxx");
  });

  it("logs counts, never invoice content", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      await post({ text: invoiceText });
    } finally {
      spy.mockRestore();
    }
    const output = lines.join("\n");
    expect(output).toContain("ai.extracted");
    expect(output).not.toContain("Aurora");
    expect(output).not.toContain("SonicWave");
    expect(output).not.toContain("8499");
  });
});
