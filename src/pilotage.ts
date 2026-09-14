
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "./db.js";
import { requireUser } from "./auth.js";
import { establishmentAccess } from "./access.js";

async function campaignAccess(userId:string,campaignId:string){
  const {rows}=await pool.query(`SELECT id,establishment_id FROM campaigns WHERE id=$1`,[campaignId]);
  if(!rows.length) return null;
  const access=await establishmentAccess(userId,rows[0].establishment_id);
  return {campaign:rows[0],access};
}

export async function registerPilotage(app:FastifyInstance){
  app.get("/api/campaigns/:id/pilotage",async(request,reply)=>{
    const user=await requireUser(request);
    const id=(request.params as any).id;
    const ca=await campaignAccess(user.sub,id);
    if(!ca) return reply.code(404).send({error:"NOT_FOUND"});
    if(!ca.access.canRead) return reply.code(403).send({error:"FORBIDDEN"});

    const q=await pool.query(`
      SELECT q.id,q.code,q.domain,q.category,q.label,q.risk_label,q.responsibility,
             q.weight,q.pcif_p,q.pcif_i,q.is_key,
             a.sphere,a.value,a.comment,a.version,a.updated_at,u.display_name AS updated_by
      FROM campaigns c
      JOIN questions q ON q.repository_version_id=c.repository_version_id AND q.active=true
      LEFT JOIN answers a ON a.campaign_id=c.id AND a.question_id=q.id
      LEFT JOIN users u ON u.id=a.updated_by
      WHERE c.id=$1
      ORDER BY q.sort_order,q.code`,[id]);

    const actions=await pool.query(`SELECT * FROM pcif_actions WHERE campaign_id=$1 ORDER BY priority,target_date NULLS LAST,created_at`,[id]);
    const workshops=await pool.query(`SELECT * FROM pcif_workshops WHERE campaign_id=$1 ORDER BY workshop_no`,[id]);
    return {questions:q.rows,actions:actions.rows,workshops:workshops.rows};
  });

  const actionSchema=z.object({
    questionId:z.string().uuid(),
    sphere:z.enum(["ORDONNATEUR","COMPTABLE","SYNTHESE"]),
    actionText:z.string().min(3).max(2000),
    priority:z.enum(["P1","P2","P3","P4"]).default("P3"),
    period:z.string().max(80).nullable().optional(),
    actor:z.string().max(160).nullable().optional(),
    status:z.enum(["A_LANCER","PREPARATION","EN_COURS","REALISEE"]).default("A_LANCER"),
    targetDate:z.string().date().nullable().optional(),
    note:z.string().max(10000).default("")
  });

  app.post("/api/campaigns/:id/actions",async(request,reply)=>{
    const user=await requireUser(request),id=(request.params as any).id;
    const ca=await campaignAccess(user.sub,id);
    if(!ca) return reply.code(404).send({error:"NOT_FOUND"});
    if(!ca.access.canWrite) return reply.code(403).send({error:"FORBIDDEN"});
    const parsed=actionSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_BODY",details:parsed.error.flatten()});
    const d=parsed.data;
    const {rows}=await pool.query(`INSERT INTO pcif_actions
      (campaign_id,question_id,sphere,action_text,priority,period,actor,status,target_date,note,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
      [id,d.questionId,d.sphere,d.actionText,d.priority,d.period??null,d.actor??null,d.status,d.targetDate??null,d.note,user.sub]);
    return reply.code(201).send(rows[0]);
  });

  app.patch("/api/campaigns/:campaignId/actions/:actionId",async(request,reply)=>{
    const user=await requireUser(request),{campaignId,actionId}=request.params as any;
    const ca=await campaignAccess(user.sub,campaignId);
    if(!ca) return reply.code(404).send({error:"NOT_FOUND"});
    if(!ca.access.canWrite) return reply.code(403).send({error:"FORBIDDEN"});
    const schema=actionSchema.partial().omit({questionId:true,sphere:true});
    const parsed=schema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_BODY"});
    const d=parsed.data;
    const {rows}=await pool.query(`UPDATE pcif_actions SET
      action_text=COALESCE($1,action_text),priority=COALESCE($2,priority),period=COALESCE($3,period),
      actor=COALESCE($4,actor),status=COALESCE($5,status),target_date=COALESCE($6,target_date),
      note=COALESCE($7,note),updated_by=$8,updated_at=now()
      WHERE id=$9 AND campaign_id=$10 RETURNING *`,
      [d.actionText??null,d.priority??null,d.period??null,d.actor??null,d.status??null,d.targetDate??null,d.note??null,user.sub,actionId,campaignId]);
    if(!rows.length) return reply.code(404).send({error:"NOT_FOUND"});
    return rows[0];
  });

  app.delete("/api/campaigns/:campaignId/actions/:actionId",async(request,reply)=>{
    const user=await requireUser(request),{campaignId,actionId}=request.params as any;
    const ca=await campaignAccess(user.sub,campaignId);
    if(!ca) return reply.code(404).send({error:"NOT_FOUND"});
    if(!ca.access.canWrite) return reply.code(403).send({error:"FORBIDDEN"});
    await pool.query(`DELETE FROM pcif_actions WHERE id=$1 AND campaign_id=$2`,[actionId,campaignId]);
    return reply.code(204).send();
  });

  app.put("/api/campaigns/:campaignId/workshops/:no",async(request,reply)=>{
    const user=await requireUser(request),{campaignId,no}=request.params as any;
    const ca=await campaignAccess(user.sub,campaignId);
    if(!ca) return reply.code(404).send({error:"NOT_FOUND"});
    if(!ca.access.canWrite) return reply.code(403).send({error:"FORBIDDEN"});
    const parsed=z.object({completed:z.boolean(),notes:z.string().max(10000).default("")}).safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_BODY"});
    const {rows}=await pool.query(`INSERT INTO pcif_workshops(campaign_id,workshop_no,completed,notes,updated_by)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(campaign_id,workshop_no) DO UPDATE SET completed=excluded.completed,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=now()
      RETURNING *`,[campaignId,Number(no),parsed.data.completed,parsed.data.notes,user.sub]);
    return rows[0];
  });
}
