
import { readFile } from "node:fs/promises";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "./db.js";
import { requireUser } from "./auth.js";
import { establishmentAccess } from "./access.js";

const here=dirname(fileURLToPath(import.meta.url));
const processRef=JSON.parse(await readFile(join(here,"../../data/pcif-processes-39.json"),"utf8"));
const fonctioRef=JSON.parse(await readFile(join(here,"../../data/fonctiopale-v5-181.json"),"utf8"));
const operations=fonctioRef.domains.flatMap((c:any)=>c.subcategories.flatMap((s:any)=>s.operations.map((o:any)=>({...o,category:c.category,subcategory:s.name}))));

async function access(userId:string,campaignId:string){
 const {rows}=await pool.query(`SELECT establishment_id FROM campaigns WHERE id=$1`,[campaignId]);
 if(!rows.length)return null;
 return establishmentAccess(userId,rows[0].establishment_id);
}

export async function registerOrganisation(app:FastifyInstance){
 app.get("/api/campaigns/:id/organisation",async(request,reply)=>{
  const user=await requireUser(request),id=(request.params as any).id;
  const a=await access(user.sub,id); if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canRead)return reply.code(403).send({error:"FORBIDDEN"});
  const actors=await pool.query(`SELECT * FROM pcif_ofn_actors WHERE campaign_id=$1 AND active=true ORDER BY name`,[id]);
  const assignments=await pool.query(`SELECT * FROM pcif_ofn_assignments WHERE campaign_id=$1 ORDER BY operation_id`,[id]);
  const reviews=await pool.query(`SELECT * FROM pcif_process_reviews WHERE campaign_id=$1`,[id]);
  return {operations,processes:processRef.processes,actors:actors.rows,assignments:assignments.rows,reviews:reviews.rows};
 });

 app.post("/api/campaigns/:id/ofn/actors",async(request,reply)=>{
  const user=await requireUser(request),id=(request.params as any).id,a=await access(user.sub,id);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({name:z.string().min(2).max(160),role:z.string().max(160).default(""),functionCode:z.string().max(80).default("")}).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
  const {rows}=await pool.query(`INSERT INTO pcif_ofn_actors(campaign_id,name,role,function_code) VALUES($1,$2,$3,$4) RETURNING *`,[id,p.data.name,p.data.role,p.data.functionCode]);
  return reply.code(201).send(rows[0]);
 });

 app.delete("/api/campaigns/:campaignId/ofn/actors/:actorId",async(request,reply)=>{
  const user=await requireUser(request),{campaignId,actorId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  await pool.query(`UPDATE pcif_ofn_actors SET active=false,updated_at=now() WHERE id=$1 AND campaign_id=$2`,[actorId,campaignId]);
  return reply.code(204).send();
 });

 app.put("/api/campaigns/:campaignId/ofn/assignments",async(request,reply)=>{
  const user=await requireUser(request),{campaignId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  const p=z.object({
   operationId:z.string().min(1),actorId:z.string().uuid(),
   directAction:z.boolean().default(false),delegation:z.boolean().default(false),substitution:z.boolean().default(false),
   ring:z.enum(["majorFormal","majorNoFormal","absenceFix","absenceJustified","supervision"]).nullable().optional(),
   note:z.string().max(4000).default("")
  }).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
  const d=p.data,{rows}=await pool.query(`INSERT INTO pcif_ofn_assignments
   (campaign_id,operation_id,actor_id,direct_action,delegation,substitution,ring,note,updated_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT(campaign_id,operation_id,actor_id) DO UPDATE SET
   direct_action=excluded.direct_action,delegation=excluded.delegation,substitution=excluded.substitution,
   ring=excluded.ring,note=excluded.note,updated_by=excluded.updated_by,updated_at=now() RETURNING *`,
   [campaignId,d.operationId,d.actorId,d.directAction,d.delegation,d.substitution,d.ring??null,d.note,user.sub]);
  return rows[0];
 });

 app.delete("/api/campaigns/:campaignId/ofn/assignments/:assignmentId",async(request,reply)=>{
  const user=await requireUser(request),{campaignId,assignmentId}=request.params as any,a=await access(user.sub,campaignId);
  if(!a)return reply.code(404).send({error:"NOT_FOUND"}); if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
  await pool.query(`DELETE FROM pcif_ofn_assignments WHERE id=$1 AND campaign_id=$2`,[assignmentId,campaignId]);return reply.code(204).send();
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
