import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  cleanupTempWorkspace,
  createTempWorkspace,
  listLeftoverWorkspaces,
  withTempWorkspace,
} from "@/lib/temp/workspace";

describe("temp workspace", () => {
  it("creates a private directory outside the repository", async () => {
    const workspace = await createTempWorkspace("unit");
    try {
      const dir = workspace.dir.toLowerCase();
      expect(dir.startsWith("/tmp") || dir.includes("tmp") || dir.includes("temp")).toBe(true);
      expect(workspace.dir).not.toContain("public");
      // Windows reports no Unix permission bits; chmod only flips the read-only flag there.
      if (process.platform !== "win32") {
        const mode = (await stat(workspace.dir)).mode & 0o777;
        expect(mode & 0o077).toBe(0);
      }
    } finally {
      await cleanupTempWorkspace(workspace.dir);
    }
  });

  it("writes files with 0600 permissions and strips path traversal", async () => {
    const workspace = await createTempWorkspace("unit");
    try {
      const path = await workspace.write("../../escape.pdf", new Uint8Array([1, 2, 3]));
      expect(path.startsWith(workspace.dir)).toBe(true);
      expect(path).not.toContain("..");
      if (process.platform !== "win32") {
        expect((await stat(path)).mode & 0o777).toBe(0o600);
      }
      expect(await readFile(path)).toEqual(Buffer.from([1, 2, 3]));
    } finally {
      await cleanupTempWorkspace(workspace.dir);
    }
  });

  it("removes the directory after success", async () => {
    let captured = "";
    await withTempWorkspace(async (workspace) => {
      captured = workspace.dir;
      await workspace.write("page-1.png", new Uint8Array([0x89, 0x50]));
    });
    expect(existsSync(captured)).toBe(false);
  });

  it("removes the directory when the callback throws — the finally guarantee", async () => {
    let captured = "";
    await expect(
      withTempWorkspace(async (workspace) => {
        captured = workspace.dir;
        await workspace.write("partial.tmp", new Uint8Array([1]));
        throw new Error("processing blew up");
      }),
    ).rejects.toThrow("processing blew up");
    expect(existsSync(captured)).toBe(false);
  });

  it("removes derived artifacts, not just the primary upload", async () => {
    let captured = "";
    await withTempWorkspace(async (workspace) => {
      captured = workspace.dir;
      await workspace.write("upload.pdf", new Uint8Array([1]));
      await workspace.write("page-1.png", new Uint8Array([2]));
      await workspace.write("page-2.png", new Uint8Array([3]));
      expect((await readdir(workspace.dir)).sort()).toEqual(["page-1.png", "page-2.png", "upload.pdf"]);
    });
    expect(existsSync(captured)).toBe(false);
  });

  it("leaves nothing behind in the system temp directory", async () => {
    const before = await listLeftoverWorkspaces();
    await withTempWorkspace(async (workspace) => workspace.write("x.txt", new Uint8Array([1]))).catch(() => undefined);
    await withTempWorkspace(async () => {
      throw new Error("boom");
    }).catch(() => undefined);
    const after = await listLeftoverWorkspaces();
    expect(after.length).toBe(before.length);
  });
});
