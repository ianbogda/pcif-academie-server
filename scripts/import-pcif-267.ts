import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const here=dirname(fileURLToPath(import.meta.url));
const ref=JSON.parse(await readFile(join(here,"../data/pcif-reference-267.json"),"utf8"));
const client=await pool.connect();
try{
 await client.query("BEGIN");
 let repo=(await client.query(`SELECT id FROM repositories WHERE code='PCIF-ACADEMIE'`)).rows[0];
 if(!repo) repo=(await client.query(`INSERT INTO repositories(code,label) VALUES('PCIF-ACADEMIE','PCIF Académie') RETURNING id`)).rows[0];

 let rv=(await client.query(`SELECT id FROM repository_versions WHERE repository_id=$1 AND version='PCIF-267-2026.09'`,[repo.id])).rows[0];
 if(!rv) rv=(await client.query(`INSERT INTO repository_versions(repository_id,version,published_at,active)
   VALUES($1,'PCIF-267-2026.09',CURRENT_DATE,true) RETURNING id`,[repo.id])).rows[0];

 await client.query(`UPDATE repository_versions SET active=false WHERE repository_id=$1 AND id<>$2`,[repo.id,rv.id]);

 for(const q of ref.questions){
   await client.query(`
     INSERT INTO questions(
       repository_version_id,code,domain,label,responsibility,stars,weight,sort_order,
       category,risk_label,badge,pcif_p,pcif_i,is_key,gravity,occurrence,
       corrective_label,corrective_actions,corrective_actors,corrective_deadlines,corrective_evaluations)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb)
     ON CONFLICT(repository_version_id,code) DO UPDATE SET
       domain=excluded.domain,label=excluded.label,responsibility=excluded.responsibility,
       stars=excluded.stars,weight=excluded.weight,sort_order=excluded.sort_order,
       category=excluded.category,risk_label=excluded.risk_label,badge=excluded.badge,
       pcif_p=excluded.pcif_p,pcif_i=excluded.pcif_i,is_key=excluded.is_key,
       gravity=excluded.gravity,occurrence=excluded.occurrence,
       corrective_label=excluded.corrective_label,corrective_actions=excluded.corrective_actions,
       corrective_actors=excluded.corrective_actors,corrective_deadlines=excluded.corrective_deadlines,
       corrective_evaluations=excluded.corrective_evaluations`,
     [rv.id,q.code,q.domain,q.label,q.responsibility,q.stars,q.weight,q.order,q.category,q.risk,
      Number(q.badge ?? 0),q.pcif_p,q.pcif_i,Boolean(q.is_key),q.gravity,q.occurrence,
      q.corrective_label??null,JSON.stringify(q.corrective_actions??[]),JSON.stringify(q.corrective_actors??[]),
      JSON.stringify(q.corrective_deadlines??[]),JSON.stringify(q.corrective_evaluations??[])]);
 }
 await client.query("COMMIT");
 console.log(`Référentiel importé : ${ref.questions.length} questions.`);
}catch(e){await client.query("ROLLBACK");throw e}finally{client.release();await pool.end()}
