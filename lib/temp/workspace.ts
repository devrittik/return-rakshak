import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { log } from "@/lib/logger";

/**
 * Scratch space for one request. Never inside the repo, never under `public/`.
 *
 * The directory is created with mkdtemp (0700, unguessable name) and removed in
 * a `finally` block by cleanupTempWorkspace — including when the callback
 * throws, times out or the process aborts the response.
 */
export interface TempWorkspace {
  readonly dir: string;
  /** Writes a file with 0600 permissions and returns its absolute path. */
  write(fileName: string, data: Uint8Array): Promise<string>;
}

const PREFIX = "returnrakshak-";

export async function createTempWorkspace(tag = "job"): Promise<TempWorkspace> {
  const dir = await mkdtemp(join(tmpdir(), `${PREFIX}${tag}-`));
  await chmod(dir, 0o700);
  return {
    dir,
    async write(fileName, data) {
      // Strip any path components: a crafted upload name cannot escape the dir.
      const safeName = basename(fileName).replace(/[^\w.\-]/g, "_");
      const path = join(dir, safeName);
      await writeFile(path, data, { mode: 0o600 });
      return path;
    },
  };
}

export async function cleanupTempWorkspace(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Cleanup failure is reported by event + directory basename only.
    log.warn("temp.cleanup_failed", { dir: basename(dir), reason: error instanceof Error ? error.name : "unknown" });
  }
}

/**
 * Runs `fn` with a temp workspace and guarantees removal afterwards.
 * Cleanup runs on success, on throw and on early return.
 */
export async function withTempWorkspace<T>(
  fn: (workspace: TempWorkspace) => Promise<T>,
  tag = "job",
): Promise<T> {
  const workspace = await createTempWorkspace(tag);
  try {
    return await fn(workspace);
  } finally {
    await cleanupTempWorkspace(workspace.dir);
  }
}

/** Test/inspection helper: are leftovers present in the system temp dir? */
export async function listLeftoverWorkspaces(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(tmpdir());
  return entries.filter((entry) => entry.startsWith(PREFIX));
}
