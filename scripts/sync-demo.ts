import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const client=await pool.connect();
try{
 await client.query("BEGIN");
 const rv=(await client.query(`SELECT rv.id FROM repository_versions rv JOIN repositories r ON r.id=rv.repository_id
   WHERE rv.version='PCIF-267-2026.09' ORDER BY rv.active DESC,rv.published_at DESC NULLS LAST LIMIT 1`)).rows[0];
 if(!rv) throw new Error("Référentiel PCIF-267-2026.09 absent. Exécuter npm run db:reference avant db:demo-sync.");
 const admin=(await client.query(`SELECT id FROM users WHERE email='admin@example.test' AND deleted_at IS NULL`)).rows[0];
 if(!admin){console.log("Aucun compte de démo : synchronisation ignorée.");await client.query("ROLLBACK");process.exit(0)}
 const auditHash=await bcrypt.hash("ChangeMe-AUDIT-2026!",12);
 const auditor=(await client.query(`INSERT INTO users(email,display_name,password_hash,active) VALUES('auditeur@example.test','Auditeur Démo',$1,true) ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,password_hash=excluded.password_hash,active=true,deleted_at=NULL RETURNING id`,[auditHash])).rows[0];
 const demo=await client.query(`SELECT id,uai,name FROM establishments WHERE uai LIKE '028000_' ORDER BY uai`);
 const brossolette=demo.rows.find((e:any)=>e.uai==='0280002B');
 if(brossolette){await client.query(`INSERT INTO user_establishment_roles(user_id,establishment_id,role_id) SELECT $1,$2,id FROM roles WHERE code='AUDITOR' ON CONFLICT DO NOTHING`,[auditor.id,brossolette.id]);}
 for(const e of demo.rows){
   const label=`PCIF Académie 2026-2027 — ${e.uai}`;
   const old=await client.query(`SELECT id FROM campaigns WHERE establishment_id=$1 AND (label LIKE 'PCIF Démo 2026-2027%' OR label LIKE 'PCIF Académie 2026-2027%') ORDER BY created_at LIMIT 1`,[e.id]);
   let cid;
   if(old.rows[0]){
     cid=old.rows[0].id;
     await client.query(`UPDATE campaigns SET repository_version_id=$1,label=$2,status='OPEN',updated_at=now() WHERE id=$3`,[rv.id,label,cid]);
   }else{
     cid=(await client.query(`INSERT INTO campaigns(establishment_id,repository_version_id,label,status,created_by) VALUES($1,$2,$3,'OPEN',$4) RETURNING id`,[e.id,rv.id,label,admin.id])).rows[0].id;
   }
 }
 // Préremplissage léger sur Brossolette pour rendre les visuels de démonstration immédiatement parlants.
 const target=(await client.query(`SELECT c.id FROM campaigns c JOIN establishments e ON e.id=c.establishment_id WHERE e.uai='0280002B' AND c.repository_version_id=$1 ORDER BY c.created_at LIMIT 1`,[rv.id])).rows[0];
 if(target){
   const qs=await client.query(`SELECT id,responsibility,sort_order FROM (SELECT q.id,q.responsibility,q.sort_order,q.domain,ROW_NUMBER() OVER(PARTITION BY q.domain ORDER BY q.sort_order) rn FROM questions q WHERE q.repository_version_id=$1) x WHERE rn<=6 ORDER BY sort_order`,[rv.id]);
   let i=0;
   for(const q of qs.rows){
     const value=[3,3,2,3,1,3,2,3,3,2,1,3][i%12];
     const sphere=q.responsibility==='COMPTABLE'?'COMPTABLE':'ORDONNATEUR';
     await client.query(`INSERT INTO answers(campaign_id,question_id,sphere,value,comment,version,updated_by)
       VALUES($1,$2,$3,$4,$5,1,$6)
       ON CONFLICT(campaign_id,question_id,sphere) DO NOTHING`,[target.id,q.id,sphere,value,'Réponse de démonstration PCIF Académie',admin.id]);
     i++;
   }
 }
 await client.query("COMMIT");
 console.log(`Démo synchronisée sur le référentiel 267 : ${demo.rowCount} établissements.`);
}catch(e){await client.query("ROLLBACK");throw e}finally{client.release();await pool.end()}
