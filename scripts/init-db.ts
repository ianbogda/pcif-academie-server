import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(here, "../sql");
const files = (await readdir(sqlDir)).filter(x => /^\d+_.*\.sql$/.test(x)).sort();

for (const file of files) {
  const sql = await readFile(join(sqlDir, file), "utf8");
  await pool.query(sql);
  console.log(`Migration appliquée: ${file}`);
}
console.log("Schéma PCIF Académie initialisé.");
await pool.end();
