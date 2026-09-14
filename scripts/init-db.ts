import { readFile } from "node:fs/promises";
import { pool } from "../src/db.js";

const sql = await readFile(new URL("../sql/001_schema.sql", import.meta.url), "utf8");
await pool.query(sql);
console.log("Schema PCIF Académie initialisé.");
await pool.end();
