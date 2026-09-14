import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../src/db.js";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i=args.indexOf(name);
  return i>=0 ? args[i+1] : undefined;
};
const schema=z.object({
  email:z.string().trim().toLowerCase().email(),
  name:z.string().trim().min(2),
  password:z.string().min(12)
});
const parsed=schema.safeParse({
  email:value("--email"), name:value("--name"), password:value("--password")
});
if(!parsed.success){
  console.error("Usage: npm run admin:create -- --email admin@domaine.fr --name \"Administrateur\" --password \"MotDePasseSolide!\"");
  console.error(parsed.error.flatten());
  process.exit(1);
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
