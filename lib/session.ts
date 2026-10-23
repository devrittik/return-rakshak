import "server-only";
import { db } from "@/lib/data/client";
import { getLocalOwner } from "@/lib/data/repository";
import { env } from "@/lib/env";

/**
 * The single seam where "who is the current user" is decided.
 *
 * Today there is one local owner and no login. When multi-user auth ships,
 * only this function changes: it will read the session cookie, validate it, and
 * return the authenticated user id. Every repository call already takes a
 * userId, so authorisation does not leak into the pages or API handlers.
 */
export async function currentUserId(): Promise<string> {
  const database = db();
  return getLocalOwner(database, env().RR_LOCAL_USER_EMAIL);
}
