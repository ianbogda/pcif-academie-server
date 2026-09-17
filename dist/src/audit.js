import { z } from "zod";
import { pool } from "./db.js";
import { requireUser } from "./auth.js";
import { campaignAccess, canGrantAuditMission, isPlatformAdmin } from "./access.js";
async function context(userId, campaignId) {
    const c = (await pool.query(`SELECT c.*,e.name establishment_name,e.uai FROM campaigns c JOIN establishments e ON e.id=c.establishment_id WHERE c.id=$1`, [campaignId])).rows[0];
    if (!c)
        return null;
    const access = await campaignAccess(userId, campaignId);
    if (!access?.canRead)
        return null;
    return { campaign: c, access, auditor: access.isAuditOnly, observationsAllowed: !!access.mission?.observations_allowed };
}
export async function registerAudit(app) {
    app.get("/api/audit-management/context", async (request, reply) => {
        const user = await requireUser(request), platform = await isPlatformAdmin(user.sub);
        const all = (await pool.query(`SELECT c.id,c.label,c.status,e.id establishment_id,e.uai,e.name establishment_name,e.department_name,e.academy_name,a.name agency_name FROM campaigns c JOIN establishments e ON e.id=c.establishment_id LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true LEFT JOIN accounting_agencies a ON a.id=ae.agency_id ORDER BY e.name,c.created_at DESC`)).rows;
        const campaigns = [];
        for (const c of all)
            if (platform || await canGrantAuditMission(user.sub, c.id))
                campaigns.push(c);
        if (!campaigns.length)
            return reply.code(403).send({ error: "AUDIT_MANAGER_REQUIRED" });
        const auditors = (await pool.query(`SELECT DISTINCT u.id,u.display_name,u.email FROM users u LEFT JOIN user_establishment_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.active=true AND u.deleted_at IS NULL AND (r.code='AUDITOR' OR EXISTS(SELECT 1 FROM audit_missions m WHERE m.auditor_user_id=u.id)) ORDER BY u.display_name`)).rows;
        const missions = (await pool.query(`SELECT m.*,u.display_name auditor_name,c.label campaign_label,e.name establishment_name,e.uai,g.display_name granted_by_name FROM audit_missions m JOIN users u ON u.id=m.auditor_user_id JOIN users g ON g.id=m.granted_by JOIN campaigns c ON c.id=m.campaign_id JOIN establishments e ON e.id=c.establishment_id ORDER BY m.created_at DESC`)).rows.filter((m) => campaigns.some((c) => c.id === m.campaign_id));
        return { campaigns, auditors, missions };
    });
    app.post("/api/audit-management/missions", async (request, reply) => {
        const user = await requireUser(request), p = z.object({ auditorUserId: z.string().uuid(), campaignId: z.string().uuid(), validFrom: z.string().date(), validUntil: z.string().date(), observationsAllowed: z.boolean().default(true), purpose: z.string().max(1000).default("") }).safeParse(request.body);
        if (!p.success)
            return reply.code(400).send({ error: "INVALID_MISSION", details: p.error.flatten() });
        if (!await canGrantAuditMission(user.sub, p.data.campaignId))
            return reply.code(403).send({ error: "MISSION_SCOPE_FORBIDDEN" });
        if (p.data.validUntil < p.data.validFrom)
            return reply.code(400).send({ error: "INVALID_DATES" });
        const { rows } = await pool.query(`INSERT INTO audit_missions(auditor_user_id,campaign_id,granted_by,valid_from,valid_until,observations_allowed,status,purpose) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN CURRENT_DATE BETWEEN $4::date AND $5::date THEN 'OPEN' ELSE 'PREPARED' END,$7) RETURNING *`, [p.data.auditorUserId, p.data.campaignId, user.sub, p.data.validFrom, p.data.validUntil, p.data.observationsAllowed, p.data.purpose]);
        return reply.code(201).send(rows[0]);
    });
    app.patch("/api/audit-management/missions/:id", async (request, reply) => {
        const user = await requireUser(request), id = request.params.id, mission = (await pool.query(`SELECT * FROM audit_missions WHERE id=$1`, [id])).rows[0];
        if (!mission)
            return reply.code(404).send({ error: "NOT_FOUND" });
        if (!await canGrantAuditMission(user.sub, mission.campaign_id))
            return reply.code(403).send({ error: "MISSION_SCOPE_FORBIDDEN" });
        const p = z.object({ status: z.enum(["OPEN", "CLOSED", "REVOKED"]) }).safeParse(request.body);
        if (!p.success)
            return reply.code(400).send({ error: "INVALID_STATUS" });
        const { rows } = await pool.query(`UPDATE audit_missions SET status=$1,updated_at=now() WHERE id=$2 RETURNING *`, [p.data.status, id]);
        return rows[0];
    });
    app.get("/api/campaigns/:id/audit", async (request, reply) => {
        const user = await requireUser(request), id = request.params.id, ctx = await context(user.sub, id);
        if (!ctx)
            return reply.code(403).send({ error: "FORBIDDEN" });
        if (!ctx.auditor && !ctx.access.isPlatformAdmin)
            return reply.code(403).send({ error: "AUDITOR_REQUIRED" });
        const previousCandidate = (await pool.query(`SELECT id FROM campaigns WHERE establishment_id=$1 AND created_at<$2 ORDER BY created_at DESC LIMIT 1`, [ctx.campaign.establishment_id, ctx.campaign.created_at])).rows[0]?.id;
        const previous = previousCandidate && (!ctx.access.isAuditOnly || (await campaignAccess(user.sub, previousCandidate))?.canRead) ? previousCandidate : null;
        const [withoutEvidence, divergences, risks, overdue, progressions, unassigned, formalisation, observations] = await Promise.all([
            pool.query(`SELECT q.id,q.code,q.label,q.domain,a.comment FROM questions q JOIN answers a ON a.question_id=q.id AND a.campaign_id=$1 WHERE a.value=3 AND btrim(a.comment)='' ORDER BY q.sort_order LIMIT 100`, [id]),
            pool.query(`SELECT q.id,q.code,q.label,q.domain,MAX(a.value) max_value,MIN(a.value) min_value FROM questions q JOIN answers a ON a.question_id=q.id AND a.campaign_id=$1 WHERE a.sphere IN('ORDONNATEUR','COMPTABLE') GROUP BY q.id HAVING COUNT(DISTINCT a.sphere)=2 AND MAX(a.value)<>MIN(a.value) ORDER BY q.sort_order`, [id]),
            pool.query(`SELECT q.id,q.code,q.label,q.domain,q.weight,a.value FROM questions q JOIN answers a ON a.question_id=q.id AND a.campaign_id=$1 LEFT JOIN pcif_actions pa ON pa.campaign_id=$1 AND pa.question_id=q.id WHERE q.weight>=6 AND a.value IN(1,2) AND pa.id IS NULL ORDER BY q.weight DESC LIMIT 100`, [id]),
            pool.query(`SELECT id,action_text,target_date,actor,status FROM pcif_actions WHERE campaign_id=$1 AND status<>'REALISEE' AND target_date<CURRENT_DATE ORDER BY target_date`, [id]),
            previous ? pool.query(`SELECT q.id,q.code,q.label,q.domain,cur.value current_value,prev.value previous_value FROM questions q JOIN answers cur ON cur.question_id=q.id AND cur.campaign_id=$1 JOIN answers prev ON prev.question_id=q.id AND prev.campaign_id=$2 AND prev.sphere=cur.sphere WHERE cur.value-prev.value>=2 ORDER BY q.sort_order`, [id, previous]) : Promise.resolve({ rows: [] }),
            pool.query(`SELECT GREATEST(181-COUNT(DISTINCT operation_id),0)::int count FROM pcif_ofn_assignments WHERE campaign_id=$1`, [id]),
            pool.query(`SELECT GREATEST(39-COUNT(*) FILTER(WHERE status='SECURISE'),0)::int count FROM pcif_process_reviews WHERE campaign_id=$1`, [id]),
            pool.query(`SELECT o.*,u.display_name auditor_name,ru.display_name responder_name FROM audit_observations o JOIN users u ON u.id=o.auditor_user_id LEFT JOIN users ru ON ru.id=o.responded_by WHERE o.campaign_id=$1 ORDER BY o.created_at DESC`, [id])
        ]);
        await pool.query(`INSERT INTO audit_events(user_id,establishment_id,module,entity_type,entity_id,operation,after_data) VALUES($1,$2,'AUDIT','CAMPAIGN',$3,'VIEW',jsonb_build_object('mode','AUDIT'))`, [user.sub, ctx.campaign.establishment_id, id]);
        return { campaign: ctx.campaign, observationsAllowed: ctx.observationsAllowed, findings: { withoutEvidence: withoutEvidence.rows, divergences: divergences.rows, risksWithoutAction: risks.rows, overdueActions: overdue.rows, progressions: progressions.rows, processesWithoutFormalisation: formalisation.rows[0]?.count ?? 39, unassignedOperations: unassigned.rows[0]?.count ?? 181 }, observations: observations.rows };
    });
    app.post("/api/campaigns/:id/audit/observations", async (request, reply) => {
        const user = await requireUser(request), id = request.params.id, ctx = await context(user.sub, id);
        if (!ctx || !ctx.auditor || !ctx.observationsAllowed)
            return reply.code(403).send({ error: "AUDIT_OBSERVATION_FORBIDDEN" });
        const p = z.object({ questionId: z.string().uuid().nullable().optional(), subjectType: z.enum(["CAMPAIGN", "QUESTION", "RISK", "ACTION", "PROCESS", "OFN"]).default("CAMPAIGN"), subjectId: z.string().max(200).nullable().optional(), body: z.string().trim().min(5).max(10000) }).safeParse(request.body);
        if (!p.success)
            return reply.code(400).send({ error: "INVALID_OBSERVATION" });
        const { rows } = await pool.query(`INSERT INTO audit_observations(auditor_user_id,establishment_id,campaign_id,question_id,subject_type,subject_id,body) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [user.sub, ctx.campaign.establishment_id, id, p.data.questionId ?? null, p.data.subjectType, p.data.subjectId ?? null, p.data.body]);
        await pool.query(`INSERT INTO audit_events(user_id,establishment_id,module,entity_type,entity_id,operation,after_data) VALUES($1,$2,'AUDIT','OBSERVATION',$3,'CREATE',$4::jsonb)`, [user.sub, ctx.campaign.establishment_id, rows[0].id, JSON.stringify(rows[0])]);
        return reply.code(201).send(rows[0]);
    });
    app.patch("/api/campaigns/:campaignId/audit/observations/:observationId", async (request, reply) => {
        const user = await requireUser(request), { campaignId, observationId } = request.params, ctx = await context(user.sub, campaignId);
        if (!ctx)
            return reply.code(403).send({ error: "FORBIDDEN" });
        if (ctx.auditor && !ctx.access.canWrite)
            return reply.code(403).send({ error: "ESTABLISHMENT_RESPONSE_REQUIRED" });
        const p = z.object({ status: z.enum(["ACKNOWLEDGED", "CLOSED"]), response: z.string().trim().min(2).max(10000) }).safeParse(request.body);
        if (!p.success)
            return reply.code(400).send({ error: "INVALID_RESPONSE" });
        const { rows } = await pool.query(`UPDATE audit_observations SET status=$1,response=$2,responded_by=$3,responded_at=now(),updated_at=now() WHERE id=$4 AND campaign_id=$5 RETURNING *`, [p.data.status, p.data.response, user.sub, observationId, campaignId]);
        return rows[0] || reply.code(404).send({ error: "NOT_FOUND" });
    });
}
