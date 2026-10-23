import "dotenv/config";
import { createDatabase } from "../lib/data/client";
import { getLocalOwner } from "../lib/data/repository";
import { loadDemoData } from "../lib/data/demo";
import { env } from "../lib/env";

async function main() {
  const database = createDatabase();
  const email = env().RR_LOCAL_USER_EMAIL;
  const userId = await getLocalOwner(database, email);
  const { created } = await loadDemoData(database, userId);
  console.log(created > 0 ? `✔ seeded ${created} synthetic demo products` : "• demo data already present, nothing to do");
}

main().catch((error) => {
  console.error("✖ seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
