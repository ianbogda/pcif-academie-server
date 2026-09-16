
import { readFile } from "node:fs/promises";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "./db.js";
import { requireUser } from "./auth.js";
import { campaignAccess } from "./access.js";

const here=dirname(fileURLToPath(import.meta.url));
const processRef=JSON.parse(await readFile(join(here,"../../data/pcif-processes-39.json"),"utf8"));
const fonctioRef=JSON.parse(await readFile(join(here,"../../data/fonctiopale-v5-181.json"),"utf8"));
const operations=fonctioRef.domains.flatMap((c:any)=>c.subcategories.flatMap((s:any)=>s.operations.map((o:any)=>({...o,category:c.category,subcategory:s.name}))));

async function access(userId:string,campaignId:string){
 return campaignAccess(userId,campaignId);
}

export async function registerOrganisation(app:FastifyInstance){
 app.get("/api/campaigns/:id/organisation",async(request,reply)=>{
  const user=await requireUser(request),id=(request.params as any).id;
  const a=await access(user.sub,id); if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canRead)return reply.code(403).send({error:"FORBIDDEN"});
  const actors=await pool.query(`SELECT * FROM pcif_ofn_actors WHERE campaign_id=$1 AND active=true ORDER BY name`,[id]);
  const assignments=await pool.query(`SELECT * FROM pcif_ofn_assignments WHERE campaign_id=$1 ORDER BY operation_id`,[id]);
  const reviews=await pool.query(`SELECT * FROM pcif_process_reviews WHERE campaign_id=$1`,[id]);
  const controls=await pool.query(`SELECT replace(q.code,'PCIF-','') code,q.domain,q.category,q.label,q.risk_label,q.weight,q.gravity,q.occurrence,a.value,a.sphere
    FROM campaigns c JOIN questions q ON q.repository_version_id=c.repository_version_id AND q.active=true
    LEFT JOIN LATERAL (SELECT value,sphere FROM answers WHERE campaign_id=c.id AND question_id=q.id ORDER BY (sphere='SYNTHESE') DESC,updated_at DESC LIMIT 1) a ON true
    WHERE c.id=$1 ORDER BY q.sort_order`,[id]);
  const context=(await pool.query(`SELECT e.id establishment_id,e.name establishment_name,e.uai,
      ag.id agency_id,ag.name agency_name,c.label campaign_label
    FROM campaigns c JOIN establishments e ON e.id=c.establishment_id
    LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true
    LEFT JOIN accounting_agencies ag ON ag.id=ae.agency_id
    WHERE c.id=$1 LIMIT 1`,[id])).rows[0]||null;
  const suggested=(await pool.query(`SELECT DISTINCT u.id user_id,u.display_name name,r.code role_code,
      CASE WHEN r.code IN ('AGENCY_ACCOUNTANT','AGENCY_DEPUTY') THEN 'COMPTABLE'
           WHEN r.code IN ('HEAD','SECRETARY_GENERAL') THEN 'ORDONNATEUR' ELSE 'MIXTE' END sphere
    FROM campaigns c
    JOIN establishments e ON e.id=c.establishment_id
    LEFT JOIN user_establishment_roles uer ON uer.establishment_id=e.id
    LEFT JOIN roles r ON r.id=uer.role_id
    LEFT JOIN users u ON u.id=uer.user_id
    WHERE c.id=$1 AND u.active=true AND u.deleted_at IS NULL
      AND r.code IN ('HEAD','SECRETARY_GENERAL','CONTRIBUTOR','AGENCY_ACCOUNTANT','AGENCY_DEPUTY')
    UNION
    SELECT DISTINCT u.id,u.display_name,r.code,'COMPTABLE'
    FROM campaigns c JOIN agency_establishments ae ON ae.establishment_id=c.establishment_id AND ae.active=true
    JOIN user_agency_roles uar ON uar.agency_id=ae.agency_id JOIN roles r ON r.id=uar.role_id
    JOIN users u ON u.id=uar.user_id
    WHERE c.id=$1 AND u.active=true AND u.deleted_at IS NULL
      AND r.code IN ('AGENCY_ACCOUNTANT','AGENCY_DEPUTY')`,[id])).rows;
  const versions=(await pool.query(`SELECT id,version_no,label,created_at FROM pcif_ofn_versions WHERE campaign_id=$1 ORDER BY version_no DESC`,[id])).rows;
  return {operations,processes:processRef.processes,actors:actors.rows,assignments:assignments.rows,reviews:reviews.rows,controls:controls.rows,context,suggestedActors:suggested,versions};
 });

 app.post("/api/campaigns/:id/ofn/actors",async(request,reply)=>{
  const user=await requireUser(request),id=(request.params as any).id,a=await access(user.sub,id);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({name:z.string().min(2).max(160),role:z.string().max(160).default(""),functionCode:z.string().max(80).default(""),
    sphere:z.enum(["ORDONNATEUR","COMPTABLE","MIXTE"]).default("MIXTE"),service:z.string().max(160).default(""),
    sourceUserId:z.string().uuid().nullable().optional(),source:z.enum(["MANUAL","PCIF_USER"]).default("MANUAL")}).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
  if(p.data.source==="PCIF_USER"){
   if(!p.data.sourceUserId)return reply.code(400).send({error:"SOURCE_USER_REQUIRED"});
   const eligible=await pool.query(`SELECT 1 FROM campaigns c JOIN establishments e ON e.id=c.establishment_id
     LEFT JOIN user_establishment_roles ur ON ur.establishment_id=e.id AND ur.user_id=$2
     LEFT JOIN roles r ON r.id=ur.role_id
     LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true
     LEFT JOIN user_agency_roles uar ON uar.agency_id=ae.agency_id AND uar.user_id=$2
     LEFT JOIN roles ar ON ar.id=uar.role_id
     WHERE c.id=$1 AND (r.code IN('HEAD','SECRETARY_GENERAL','CONTRIBUTOR','AGENCY_ACCOUNTANT','AGENCY_DEPUTY') OR ar.code IN('AGENCY_ACCOUNTANT','AGENCY_DEPUTY')) LIMIT 1`,[id,p.data.sourceUserId]);
   if(!eligible.rowCount)return reply.code(403).send({error:"OFN_SOURCE_USER_NOT_ELIGIBLE"});
  }
  const {rows}=await pool.query(`INSERT INTO pcif_ofn_actors(campaign_id,name,role,function_code,sphere,service,source_user_id,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[id,p.data.name,p.data.role,p.data.functionCode,p.data.sphere,p.data.service,p.data.sourceUserId??null,p.data.source]);
  return reply.code(201).send(rows[0]);
 });

 app.patch("/api/campaigns/:campaignId/ofn/actors/:actorId",async(request,reply)=>{
  const user=await requireUser(request),{campaignId,actorId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({name:z.string().min(2).max(160),role:z.string().max(160).default(""),functionCode:z.string().max(80).default(""),
    sphere:z.enum(["ORDONNATEUR","COMPTABLE","MIXTE"]),service:z.string().max(160).default("")}).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"INVALID_BODY",details:p.error.flatten()});
  const assigned=(await pool.query(`SELECT operation_id FROM pcif_ofn_assignments WHERE campaign_id=$1 AND actor_id=$2`,[campaignId,actorId])).rows;
  const opById=new Map(operations.map((o:any)=>[o.id,o]));
  const incompatible=p.data.sphere==="MIXTE"?0:assigned.filter((x:any)=>{
   const op:any=opById.get(x.operation_id);
   return op&&((op.sphere==="ordonnateur"&&p.data.sphere!=="ORDONNATEUR")||(op.sphere==="comptable"&&p.data.sphere!=="COMPTABLE"));
  }).length;
  if(incompatible)return reply.code(409).send({error:"ACTOR_SPHERE_HAS_INCOMPATIBLE_ASSIGNMENTS",count:incompatible});
  const {rows}=await pool.query(`UPDATE pcif_ofn_actors SET name=$1,role=$2,function_code=$3,sphere=$4,service=$5,updated_at=now()
    WHERE id=$6 AND campaign_id=$7 AND active=true RETURNING *`,
    [p.data.name,p.data.role,p.data.functionCode,p.data.sphere,p.data.service,actorId,campaignId]);
  if(!rows.length)return reply.code(404).send({error:"ACTOR_NOT_FOUND"});
  return rows[0];
 });

 app.delete("/api/campaigns/:campaignId/ofn/actors/:actorId",async(request,reply)=>{
  const user=await requireUser(request),{campaignId,actorId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   await client.query(`DELETE FROM pcif_ofn_assignments WHERE actor_id=$1 AND campaign_id=$2`,[actorId,campaignId]);
   await client.query(`UPDATE pcif_ofn_actors SET active=false,updated_at=now() WHERE id=$1 AND campaign_id=$2`,[actorId,campaignId]);
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
  return reply.code(204).send();
 });

 app.put("/api/campaigns/:campaignId/ofn/assignments",async(request,reply)=>{
  const user=await requireUser(request),{campaignId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({
   operationId:z.string().min(1),actorId:z.string().uuid(),
   directAction:z.boolean().default(false),delegation:z.boolean().default(false),substitution:z.boolean().default(false),
   validates:z.boolean().default(false),controls:z.boolean().default(false),
   ring:z.enum(["majorFormal","majorNoFormal","absenceFix","absenceJustified","supervision"]).nullable().optional(),
   note:z.string().max(4000).default("")
  }).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
  const d=p.data,{rows}=await pool.query(`INSERT INTO pcif_ofn_assignments
   (campaign_id,operation_id,actor_id,direct_action,delegation,substitution,validates,controls,ring,note,updated_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
   ON CONFLICT(campaign_id,operation_id,actor_id) DO UPDATE SET
   direct_action=excluded.direct_action,delegation=excluded.delegation,substitution=excluded.substitution,
   validates=excluded.validates,controls=excluded.controls,ring=excluded.ring,note=excluded.note,updated_by=excluded.updated_by,updated_at=now() RETURNING *`,
   [campaignId,d.operationId,d.actorId,d.directAction,d.delegation,d.substitution,d.validates,d.controls,d.ring??null,d.note,user.sub]);
  return rows[0];
 });

 app.put("/api/campaigns/:campaignId/ofn/assignments/bulk",async(request,reply)=>{
  const user=await requireUser(request),{campaignId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({operationIds:z.array(z.string().min(1)).min(1).max(250),actorId:z.string().uuid(),action:z.enum(["directAction","delegation","substitution","validates","controls"]),mode:z.enum(["ADD","REMOVE"]).default("ADD")}).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"INVALID_BODY",details:p.error.flatten()});
  const actor=(await pool.query(`SELECT * FROM pcif_ofn_actors WHERE id=$1 AND campaign_id=$2 AND active=true`,[p.data.actorId,campaignId])).rows[0];
  if(!actor)return reply.code(404).send({error:"ACTOR_NOT_FOUND"});
  const allowed=new Set(operations.filter((o:any)=>p.data.operationIds.includes(o.id) && (actor.sphere==='MIXTE'||(o.sphere==='ordonnateur'&&actor.sphere==='ORDONNATEUR')||(o.sphere==='comptable'&&actor.sphere==='COMPTABLE'))).map((o:any)=>o.id));
  let changed=0;
  for(const operationId of allowed){
    const ex=(await pool.query(`SELECT * FROM pcif_ofn_assignments WHERE campaign_id=$1 AND operation_id=$2 AND actor_id=$3`,[campaignId,operationId,p.data.actorId])).rows[0];
    const state={direct_action:!!ex?.direct_action,delegation:!!ex?.delegation,substitution:!!ex?.substitution,validates:!!ex?.validates,controls:!!ex?.controls};
    const col:{[key:string]:keyof typeof state}={directAction:'direct_action',delegation:'delegation',substitution:'substitution',validates:'validates',controls:'controls'}; state[col[p.data.action]]=p.data.mode==='ADD';
    if(!Object.values(state).some(Boolean)){ if(ex){await pool.query(`DELETE FROM pcif_ofn_assignments WHERE id=$1`,[ex.id]);changed++} continue; }
    await pool.query(`INSERT INTO pcif_ofn_assignments(campaign_id,operation_id,actor_id,direct_action,delegation,substitution,validates,controls,ring,note,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(campaign_id,operation_id,actor_id) DO UPDATE SET direct_action=excluded.direct_action,delegation=excluded.delegation,substitution=excluded.substitution,validates=excluded.validates,controls=excluded.controls,updated_by=excluded.updated_by,updated_at=now()`,
      [campaignId,operationId,p.data.actorId,state.direct_action,state.delegation,state.substitution,state.validates,state.controls,ex?.ring??null,ex?.note??'',user.sub]); changed++;
  }
  return {requested:p.data.operationIds.length,compatible:allowed.size,changed};
 });

 app.delete("/api/campaigns/:campaignId/ofn/assignments/:assignmentId",async(request,reply)=>{
  const user=await requireUser(request),{campaignId,assignmentId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  await pool.query(`DELETE FROM pcif_ofn_assignments WHERE id=$1 AND campaign_id=$2`,[assignmentId,campaignId]);return reply.code(204).send();
 });


 app.get("/api/campaigns/:campaignId/ofn/checks",async(request,reply)=>{
  const user=await requireUser(request),campaignId=(request.params as any).campaignId,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canRead)return reply.code(403).send({error:"FORBIDDEN"});
  const actors=(await pool.query(`SELECT * FROM pcif_ofn_actors WHERE campaign_id=$1 AND active=true`,[campaignId])).rows;
  const ass=(await pool.query(`SELECT * FROM pcif_ofn_assignments WHERE campaign_id=$1`,[campaignId])).rows;
  const findings:any[]=[];
  for(const op of operations){
    const rows=ass.filter((x:any)=>x.operation_id===op.id);
    if(rows.length && !rows.some((x:any)=>x.substitution)) findings.push({code:"NO_SUBSTITUTE",severity:"VIGILANCE",label:`${op.name} : aucune suppléance identifiée`,operationId:op.id});
    if(rows.length && rows.length===1) findings.push({code:"SINGLE_POINT",severity:"VIGILANCE",label:`${op.name} repose sur une seule personne`,operationId:op.id});
    for(const x of rows){
      const ac=actors.find((z:any)=>z.id===x.actor_id);
      if(ac && ((op.sphere==="ordonnateur"&&ac.sphere==="COMPTABLE")||(op.sphere==="comptable"&&ac.sphere==="ORDONNATEUR")))
        findings.push({code:"SPHERE_CONFLICT",severity:"MAJEUR",label:`${ac.name} est positionné hors de sa sphère sur ${op.name}`,operationId:op.id,actorId:ac.id});
      if(x.delegation&&!x.note) findings.push({code:"DELEGATION_EVIDENCE",severity:"VIGILANCE",label:`${op.name} : délégation à documenter pour ${ac?.name||"acteur"}`,operationId:op.id,actorId:ac?.id});
    }
  }
  return findings;
 });

 app.post("/api/campaigns/:campaignId/ofn/versions",async(request,reply)=>{
  const user=await requireUser(request),campaignId=(request.params as any).campaignId,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({label:z.string().min(3).max(200)}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
  const actors=(await pool.query(`SELECT * FROM pcif_ofn_actors WHERE campaign_id=$1 AND active=true ORDER BY name`,[campaignId])).rows;
  const assignments=(await pool.query(`SELECT * FROM pcif_ofn_assignments WHERE campaign_id=$1 ORDER BY operation_id`,[campaignId])).rows;
  const n=(await pool.query(`SELECT COALESCE(MAX(version_no),0)+1 n FROM pcif_ofn_versions WHERE campaign_id=$1`,[campaignId])).rows[0].n;
  const {rows}=await pool.query(`INSERT INTO pcif_ofn_versions(campaign_id,version_no,label,snapshot,created_by)
    VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id,version_no,label,created_at`,
    [campaignId,n,p.data.label,JSON.stringify({actors,assignments}),user.sub]);
  return reply.code(201).send(rows[0]);
 });

 app.put("/api/campaigns/:campaignId/processes/:processId",async(request,reply)=>{
  const user=await requireUser(request),{campaignId,processId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({priority:z.boolean(),status:z.enum(["A_EXAMINER","EN_COURS","SECURISE"]),note:z.string().max(10000).default("")}).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
  const {rows}=await pool.query(`INSERT INTO pcif_process_reviews(campaign_id,process_id,priority,status,note,updated_by)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(campaign_id,process_id) DO UPDATE SET
   priority=excluded.priority,status=excluded.status,note=excluded.note,updated_by=excluded.updated_by,updated_at=now()
   RETURNING *`,[campaignId,processId,p.data.priority,p.data.status,p.data.note,user.sub]);
  return rows[0];
 });
}
