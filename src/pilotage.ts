
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
             q.weight,q.pcif_p,q.pcif_i,q.gravity,q.occurrence,q.is_key,
             q.corrective_label,q.corrective_actions,q.corrective_actors,
             q.corrective_deadlines,q.corrective_evaluations,
             a.sphere,a.value,a.comment,a.version,a.updated_at,u.display_name AS updated_by
      FROM campaigns c
      JOIN questions q ON q.repository_version_id=c.repository_version_id AND q.active=true
      LEFT JOIN answers a ON a.campaign_id=c.id AND a.question_id=q.id
      LEFT JOIN users u ON u.id=a.updated_by
      WHERE c.id=$1
      ORDER BY q.sort_order,q.code`,[id]);

    const actions=await pool.query(`SELECT * FROM pcif_actions WHERE campaign_id=$1 ORDER BY priority,target_date NULLS LAST,created_at`,[id]);
    const workshops=await pool.query(`SELECT * FROM pcif_workshops WHERE campaign_id=$1 ORDER BY workshop_no`,[id]);
    const workshopSessions=await pool.query(`SELECT s.*,u.display_name AS updated_by_name
      FROM pcif_workshop_sessions s LEFT JOIN users u ON u.id=s.updated_by
      WHERE s.campaign_id=$1 ORDER BY s.workshop_no,s.session_date DESC,s.created_at DESC`,[id]);
    return {questions:q.rows,actions:actions.rows,workshops:workshops.rows,workshopSessions:workshopSessions.rows};
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


  const workshopSessionSchema=z.object({
    workshopNo:z.number().int().min(1).max(4),
    sessionKind:z.enum(["INITIALISATION","REEXAMEN"]).default("INITIALISATION"),
    status:z.enum(["A_PREPARER","EN_COURS","TERMINEE","A_REINTERROGER"]).default("A_PREPARER"),
    sessionDate:z.string().date(),
    nextReviewDate:z.string().date().nullable().optional(),
    reason:z.string().max(1000).default(""),
    participants:z.string().max(3000).default(""),
    notes:z.string().max(20000).default(""),
    decisions:z.string().max(20000).default(""),
    deliverable:z.string().max(10000).default(""),
    exitCriteria:z.record(z.string(),z.boolean()).default({})
  });

  app.post("/api/campaigns/:campaignId/workshop-sessions",async(request,reply)=>{
    const user=await requireUser(request),{campaignId}=request.params as any;
    const ca=await campaignAccess(user.sub,campaignId);
    if(!ca) return reply.code(404).send({error:"NOT_FOUND"});
    if(!ca.access.canWrite) return reply.code(403).send({error:"FORBIDDEN"});
    const parsed=workshopSessionSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_BODY",details:parsed.error.flatten()});
    const d=parsed.data;
    const {rows}=await pool.query(`INSERT INTO pcif_workshop_sessions
      (campaign_id,workshop_no,session_kind,status,session_date,next_review_date,reason,participants,notes,decisions,deliverable,exit_criteria,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$13) RETURNING *`,
      [campaignId,d.workshopNo,d.sessionKind,d.status,d.sessionDate,d.nextReviewDate??null,d.reason,d.participants,d.notes,d.decisions,d.deliverable,JSON.stringify(d.exitCriteria),user.sub]);
    return reply.code(201).send(rows[0]);
  });

  app.patch("/api/campaigns/:campaignId/workshop-sessions/:sessionId",async(request,reply)=>{
    const user=await requireUser(request),{campaignId,sessionId}=request.params as any;
    const ca=await campaignAccess(user.sub,campaignId);
    if(!ca) return reply.code(404).send({error:"NOT_FOUND"});
    if(!ca.access.canWrite) return reply.code(403).send({error:"FORBIDDEN"});
    const parsed=workshopSessionSchema.partial().omit({workshopNo:true}).safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_BODY",details:parsed.error.flatten()});
    const d=parsed.data;
    const {rows}=await pool.query(`UPDATE pcif_workshop_sessions SET
      session_kind=COALESCE($1,session_kind),status=COALESCE($2,status),
      session_date=COALESCE($3,session_date),next_review_date=CASE WHEN $4::boolean THEN $5::date ELSE next_review_date END,
      reason=COALESCE($6,reason),participants=COALESCE($7,participants),notes=COALESCE($8,notes),
      decisions=COALESCE($9,decisions),deliverable=COALESCE($10,deliverable),
      exit_criteria=COALESCE($11::jsonb,exit_criteria),updated_by=$12,updated_at=now()
      WHERE id=$13 AND campaign_id=$14 RETURNING *`,
      [d.sessionKind??null,d.status??null,d.sessionDate??null,
       Object.prototype.hasOwnProperty.call(d,"nextReviewDate"),d.nextReviewDate??null,
       d.reason??null,d.participants??null,d.notes??null,d.decisions??null,d.deliverable??null,
       d.exitCriteria?JSON.stringify(d.exitCriteria):null,user.sub,sessionId,campaignId]);
    if(!rows.length) return reply.code(404).send({error:"NOT_FOUND"});
    return rows[0];
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
