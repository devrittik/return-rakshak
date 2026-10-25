import { describe, expect, it } from "vitest";
import { icsFilename } from "@/lib/calendar/ics";
import { unauthenticatedHostBlockReason } from "@/lib/security/deployment";
import { securityHeaders } from "@/lib/security/headers.mjs";

const hosted = {
  nodeEnv: "production",
  tursoUrl: "libsql://returnrakshak-secret.turso.io",
};

describe("hosted deployment gate", () => {
  it("refuses a production hosted database that has no acknowledgement", () => {
    const reason = unauthenticatedHostBlockReason(hosted);
    expect(reason).toMatch(/without authentication/i);
    expect(reason).not.toContain("secret");
    expect(reason).not.toContain("libsql://");
  });

  it("allows local production, development, and an explicit private acknowledgement", () => {
    expect(unauthenticatedHostBlockReason({ nodeEnv: "production" })).toBeNull();
    expect(unauthenticatedHostBlockReason({ ...hosted, nodeEnv: "development" })).toBeNull();
    expect(unauthenticatedHostBlockReason({ ...hosted, allowUnauthenticatedHost: "1" })).toBeNull();
    expect(unauthenticatedHostBlockReason({ ...hosted, allowUnauthenticatedHost: "true" })).toMatch(/without authentication/i);
  });
});

describe("security headers", () => {
  it("denies framing, strips referrers, and keeps scripts on this origin", () => {
    const headers = Object.fromEntries(securityHeaders(false).map((header) => [header.key, header.value]));
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'self'");
  });

  it("allows the dev server's refresh websocket and eval", () => {
    const policy = securityHeaders(true).find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(policy).toContain("unsafe-eval");
    expect(policy).toContain("ws:");
  });
});

describe("calendar download name", () => {
  it("drops quotes and newlines so a product name cannot break Content-Disposition", () => {
    expect(icsFilename('Lamp"\r\nX-Evil: 1')).toBe("returnrakshak-lamp-x-evil-1.ics");
    expect(icsFilename('Lamp"\r\nX-Evil: 1')).not.toMatch(/["\r\n]/);
  });
});
