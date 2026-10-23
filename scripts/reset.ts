import "dotenv/config";
import { rmSync } from "node:fs";

const path = "./data/returnrakshak.db";
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  rmSync(path + suffix, { force: true });
}
console.log("✔ local database removed — run `npm run db:migrate` to recreate");
