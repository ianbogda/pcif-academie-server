import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const here=dirname(fileURLToPath(import.meta.url));
const ref=JSON.parse(await readFile(join(here,"../data/pcif-reference-267.json"),"utf8"));
const client=await pool.connect();
try{
 await client.query("BEGIN");
 let repo=(await client.query(`SELECT id FROM question_repositories WHERE code='PCIF-ACADEMIE'`)).rows[0];
 if(!repo) repo=(await client.query(`INSERT INTO question_repositories(code,label) VALUES('PCIF-ACADEMIE','PCIF Académie') RETURNING id`)).rows[0];

 let rv=(await client.query(`SELECT id FROM question_repository_versions WHERE repository_id=$1 AND version='PCIF-267-2026.09'`,[repo.id])).rows[0];
 if(!rv) rv=(await client.query(`INSERT INTO question_repository_versions(repository_id,version,label,active)
   VALUES($1,'PCIF-267-2026.09','Référentiel PCIF Académie — 267 questions',true) RETURNING id`,[repo.id])).rows[0];

 await client.query(`UPDATE question_repository_versions SET active=false WHERE repository_id=$1 AND id<>$2`,[repo.id,rv.id]);

 for(const q of ref.questions){
   await client.query(`
     INSERT INTO questions(repository_version_id,code,domain,label,responsibility,stars,weight,sort_order,category,risk_label,badge,pcif_p,pcif_i)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT(repository_version_id,code) DO UPDATE SET
       domain=excluded.domain,label=excluded.label,responsibility=excluded.responsibility,
       stars=excluded.stars,weight=excluded.weight,sort_order=excluded.sort_order,
       category=excluded.category,risk_label=excluded.risk_label,badge=excluded.badge,
       pcif_p=excluded.pcif_p,pcif_i=excluded.pcif_i`,
     [rv.id,q.code,q.domain,q.label,q.responsibility,q.stars,q.weight,q.order,q.category,q.risk,q.badge,q.pcif_p,q.pcif_i]);
 }
 await client.query("COMMIT");
 console.log(`Référentiel importé : ${ref.questions.length} questions.`);
}catch(e){await client.query("ROLLBACK");throw e}finally{client.release();await pool.end()}
