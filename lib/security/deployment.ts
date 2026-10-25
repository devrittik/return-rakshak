/**
 * A hosted database with no login is one shared record set for anyone who
 * can open the site. Production refuses to open that connection unless the
 * operator sets an explicit acknowledgement. Local SQLite is unaffected.
 * Migrations do not call this — applying a schema is not the same as serving it.
 */

export interface DeploymentEnv {
  nodeEnv?: string;
  tursoUrl?: string;
  allowUnauthenticatedHost?: string;
}

export function unauthenticatedHostBlockReason(env: DeploymentEnv): string | null {
  if (env.nodeEnv !== "production") return null;
  if (!env.tursoUrl) return null;
  if (env.allowUnauthenticatedHost === "1") return null;
  return "Refusing to open a hosted database without authentication. Anyone who can reach this server would share one record set. Set RR_ALLOW_UNAUTHENTICATED_HOST=1 only for a private single-user deployment, or add authentication first.";
}

export function assertSafeDeployment(env: DeploymentEnv = deploymentEnvFromProcess()): void {
  const reason = unauthenticatedHostBlockReason(env);
  if (reason) throw new Error(reason);
}

function deploymentEnvFromProcess(): DeploymentEnv {
  return {
    nodeEnv: process.env.NODE_ENV,
    tursoUrl: process.env.TURSO_DATABASE_URL,
    allowUnauthenticatedHost: process.env.RR_ALLOW_UNAUTHENTICATED_HOST,
  };
}
