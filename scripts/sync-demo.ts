import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const DEMO_UAIS=[
  "0280001A","0280002B","0280003C","0280004D",
  "0280005E","0280006F","0280007G","0280008H"
];

const client=await pool.connect();
try{
 await client.query("BEGIN");

 const rv=(await client.query(`
   SELECT rv.id
   FROM repository_versions rv
   JOIN repositories r ON r.id=rv.repository_id
   WHERE rv.version='PCIF-267-2026.09'
   ORDER BY rv.active DESC,rv.published_at DESC NULLS LAST
   LIMIT 1
 `)).rows[0];
 if(!rv) throw new Error("Référentiel PCIF-267-2026.09 absent. Exécuter npm run db:reference avant db:demo-sync.");

 const count=(await client.query(`SELECT count(*)::int AS n FROM questions WHERE repository_version_id=$1 AND active=true`,[rv.id])).rows[0]?.n;
 if(count!==267) throw new Error(`Référentiel PCIF incomplet : ${count} questions au lieu de 267.`);

 const admin=(await client.query(`SELECT id FROM users WHERE email='admin@example.test' AND deleted_at IS NULL`)).rows[0];
 if(!admin){console.log("Aucun compte de démonstration : synchronisation ignorée.");await client.query("ROLLBACK");process.exit(0)}

 const auditHash=await bcrypt.hash("ChangeMe-AUDIT-2026!",12);
 const auditor=(await client.query(`
   INSERT INTO users(email,display_name,password_hash,active)
   VALUES('auditeur@example.test','Auditeur Démo',$1,true)
   ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,password_hash=excluded.password_hash,active=true,deleted_at=NULL
   RETURNING id`,[auditHash])).rows[0];

 const demo=await client.query(`SELECT id,uai,name FROM establishments WHERE uai=ANY($1::varchar[]) ORDER BY uai`,[DEMO_UAIS]);
 if(demo.rowCount!==8) console.warn(`Attention : ${demo.rowCount}/8 établissements de démonstration trouvés.`);

 const brossolette=demo.rows.find((e:any)=>e.uai==="0280002B");
 if(brossolette){
   await client.query(`INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
     SELECT $1,$2,id FROM roles WHERE code='AUDITOR' ON CONFLICT DO NOTHING`,[auditor.id,brossolette.id]);
 }

 for(const e of demo.rows){
   const label=`PCIF Académie 2026-2027 — ${e.uai}`;
   const campaigns=await client.query(`
     SELECT c.id,c.repository_version_id,rv.version,
            (SELECT count(*)::int FROM questions q WHERE q.repository_version_id=c.repository_version_id AND q.active=true) AS question_count
     FROM campaigns c
     JOIN repository_versions rv ON rv.id=c.repository_version_id
     WHERE c.establishment_id=$1
       AND c.status IN ('DRAFT','OPEN','REVIEW')
     ORDER BY c.created_at`,[e.id]);

   let cid:string;
   const canonical=campaigns.rows.find((c:any)=>c.repository_version_id===rv.id);

   if(canonical){
     cid=canonical.id;
     await client.query(`UPDATE campaigns SET label=$1,status='OPEN',updated_at=now() WHERE id=$2`,[label,cid]);
   }else if(campaigns.rows.length){
     cid=campaigns.rows[0].id;

     // Les réponses de l'ancien mini-référentiel ne sont pas transposables au référentiel réglementaire.
     await client.query(`DELETE FROM answers WHERE campaign_id=$1`,[cid]);
     await client.query(`DELETE FROM pcif_actions WHERE campaign_id=$1`,[cid]).catch(()=>undefined);
     await client.query(`UPDATE campaigns SET repository_version_id=$1,label=$2,status='OPEN',updated_at=now() WHERE id=$3`,[rv.id,label,cid]);
   }else{
     cid=(await client.query(`INSERT INTO campaigns(establishment_id,repository_version_id,label,status,created_by)
       VALUES($1,$2,$3,'OPEN',$4) RETURNING id`,[e.id,rv.id,label,admin.id])).rows[0].id;
   }

   // Supprime les doublons actifs de démonstration pour que l'utilisateur ne puisse plus ouvrir une campagne à 3 questions.
   await client.query(`
     UPDATE campaigns
     SET status='ARCHIVED',updated_at=now()
     WHERE establishment_id=$1 AND id<>$2
       AND status IN ('DRAFT','OPEN','REVIEW')
       AND repository_version_id<>$3`,[e.id,cid,rv.id]);

   // Deux campagnes historiques réelles, consultables depuis le tableau de bord.
   const history=[
     {label:`PCIF 2024-2025 — ${e.uai}`,date:"2024-09-01",yes:3,partial:7},
     {label:`PCIF 2025-2026 — ${e.uai}`,date:"2025-09-01",yes:5,partial:8}
   ];
   for(const h of history){
     let historic=(await client.query(`SELECT id FROM campaigns WHERE establishment_id=$1 AND label=$2 LIMIT 1`,[e.id,h.label])).rows[0];
     if(!historic) historic=(await client.query(`INSERT INTO campaigns(establishment_id,repository_version_id,label,status,created_by,created_at,updated_at)
       VALUES($1,$2,$3,'VALIDATED',$4,$5::date,$5::date) RETURNING id`,[e.id,rv.id,h.label,admin.id,h.date])).rows[0];
     else await client.query(`UPDATE campaigns SET repository_version_id=$1,status='VALIDATED',created_at=$2::date,updated_at=$2::date WHERE id=$3`,[rv.id,h.date,historic.id]);
     await client.query(`DELETE FROM answers WHERE campaign_id=$1`,[historic.id]);
     await client.query(`DELETE FROM pcif_actions WHERE campaign_id=$1`,[historic.id]);
     const hqs=(await client.query(`SELECT id,responsibility,sort_order FROM questions WHERE repository_version_id=$1 AND active=true ORDER BY sort_order`,[rv.id])).rows;
     for(let qi=0;qi<hqs.length;qi++){
       const q=hqs[qi],mod=qi%10,value=mod<h.yes?3:mod<h.partial?2:1,sphere=q.responsibility==='COMPTABLE'?'COMPTABLE':'ORDONNATEUR';
       await client.query(`INSERT INTO answers(campaign_id,question_id,sphere,value,comment,version,updated_by,updated_at)
         VALUES($1,$2,$3,$4,$5,1,$6,$7::date)`,[historic.id,q.id,sphere,value,`Diagnostic fictif ${h.label}`,admin.id,h.date]);
     }
     const actionQuestions=hqs.filter((_:any,qi:number)=>{const mod=qi%10;return mod>=h.yes}).slice(0,6);
     for(let ai=0;ai<actionQuestions.length;ai++){
       const q=actionQuestions[ai],older=h.date.startsWith('2024'),status=older?(ai<5?'REALISEE':'EN_COURS'):(ai<3?'REALISEE':ai<5?'EN_COURS':'A_LANCER');
       await client.query(`INSERT INTO pcif_actions(campaign_id,question_id,sphere,action_text,priority,period,actor,status,target_date,note,created_by,updated_by,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$11,$12::date,$12::date)`,
         [historic.id,q.id,q.responsibility==='COMPTABLE'?'COMPTABLE':'ORDONNATEUR',`Action de sécurisation ${ai+1} — ${h.label}`,ai<2?'P1':'P2',older?'2024-2025':'2025-2026',ai%2?'Secrétaire général':'Agent comptable',status,older?'2025-06-30':'2026-06-30',status==='REALISEE'?'Action réalisée et preuve archivée.':'Action à poursuivre dans la campagne suivante.',admin.id,h.date]);
     }
   }
 }

 // Préremplissage réaliste sur Brossolette : 36 réponses prises sur le vrai référentiel.
 const target=(await client.query(`
   SELECT c.id FROM campaigns c
   JOIN establishments e ON e.id=c.establishment_id
   WHERE e.uai='0280002B' AND c.repository_version_id=$1 AND c.status='OPEN'
   ORDER BY c.created_at LIMIT 1`,[rv.id])).rows[0];

 if(target){
   const qs=await client.query(`
     SELECT id,responsibility,sort_order FROM (
       SELECT q.id,q.responsibility,q.sort_order,q.domain,
              ROW_NUMBER() OVER(PARTITION BY q.domain ORDER BY q.sort_order) rn
       FROM questions q WHERE q.repository_version_id=$1 AND q.active=true
     ) x WHERE rn<=6 ORDER BY sort_order`,[rv.id]);
   let i=0;
   for(const q of qs.rows){
     const value=[3,3,2,3,1,3,2,3,3,2,1,3][i%12];
     const sphere=q.responsibility==='COMPTABLE'?'COMPTABLE':'ORDONNATEUR';
     await client.query(`INSERT INTO answers(campaign_id,question_id,sphere,value,comment,version,updated_by)
       VALUES($1,$2,$3,$4,$5,1,$6)
       ON CONFLICT(campaign_id,question_id,sphere) DO NOTHING`,
       [target.id,q.id,sphere,value,'Réponse de démonstration sur le référentiel PCIF 267',admin.id]);
     i++;
   }
 }

 await client.query("COMMIT");
 console.log(`Démo synchronisée : ${demo.rowCount} EPLE, 3 campagnes par EPLE, référentiel réglementaire vérifié à ${count} questions.`);
}catch(e){await client.query("ROLLBACK");throw e}finally{client.release();await pool.end()}
