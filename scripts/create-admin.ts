import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../src/db.js";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i=args.indexOf(name);
  return i>=0 ? args[i+1] : undefined;
};
async function readPasswordFromStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
}
const password = args.includes("--password-stdin")
  ? await readPasswordFromStdin()
  : value("--password");
const schema=z.object({
  email:z.string().trim().toLowerCase().email(),
  name:z.string().trim().min(2),
  password:z.string().min(12)
});
const parsed=schema.safeParse({
  email:value("--email"), name:value("--name"), password
});
if(!parsed.success){
  console.error("Usage: printf '%s' \"$PASSWORD\" | npm run admin:create -- --email admin@domaine.fr --name \"Administrateur\" --password-stdin");
  console.error(parsed.error.flatten());
  process.exit(1);
}
if(args.includes("--initial")){
  const existing=await pool.query(
    `SELECT 1 FROM users WHERE is_platform_admin=true AND active=true AND deleted_at IS NULL LIMIT 1`
  );
  if(existing.rowCount){
    console.error("Amorçage refusé : un administrateur plateforme actif existe déjà.");
    await pool.end();
    process.exit(1);
  }
}
const hash=await bcrypt.hash(parsed.data.password,12);
const {rows}=await pool.query(
  `INSERT INTO users(email,display_name,password_hash,active,is_platform_admin,deleted_at)
   VALUES($1,$2,$3,true,true,NULL)
   ON CONFLICT(email) DO UPDATE SET
     display_name=excluded.display_name,password_hash=excluded.password_hash,
     active=true,is_platform_admin=true,deleted_at=NULL
   RETURNING id,email,display_name,is_platform_admin`,
  [parsed.data.email,parsed.data.name,hash]
);
console.log("Administrateur plateforme créé/mis à jour:", rows[0]);
await pool.end();
