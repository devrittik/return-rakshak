export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSafeDeployment } = await import("@/lib/security/deployment");
  assertSafeDeployment();
}
