import { readFileSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import "dotenv/config";
import { pool, tx } from "./db.js";
import { registerAuth, requireUser } from "./auth.js";
import { establishmentAccess, campaignAccess,canWriteSphere, isPlatformAdmin } from "./access.js";
import { registerAdmin } from "./admin.js";
import { registerPilotage } from "./pilotage.js";
import { registerOrganisation } from "./organisation.js";
import { registerAudit } from "./audit.js";
import { registerAccessibility } from "./accessibility.js";
import { z } from "zod";

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, {
  origin: (process.env.CORS_ORIGIN ?? "").split(",").filter(Boolean),
  credentials: false
});
await app.register(jwt, { secret: process.env.JWT_SECRET ?? "INSECURE_DEV_SECRET_CHANGE_ME" });
await registerAuth(app);
await registerAdmin(app);
await registerPilotage(app);
await registerOrganisation(app);
await registerAudit(app);
await registerAccessibility(app);

app.get("/health", async () => {
  await pool.query("SELECT 1");
  return { status: "ok", service: "pcif-academie-server", version: packageVersion };
});

app.get("/api/me", async (request) => {
  const user = await requireUser(request);
  const memberships = await pool.query(
    `SELECT e.id, e.uai, e.name, r.code AS role
       FROM user_establishment_roles uer
       JOIN establishments e ON e.id=uer.establishment_id
       JOIN roles r ON r.id=uer.role_id
      WHERE uer.user_id=$1
      ORDER BY e.name, r.code`,
    [user.sub]
  );
  const agencies = await pool.query(
    `SELECT a.id, a.name, r.code AS role
       FROM user_agency_roles uar
       JOIN accounting_agencies a ON a.id=uar.agency_id
       JOIN roles r ON r.id=uar.role_id
      WHERE uar.user_id=$1 ORDER BY a.name`,
    [user.sub]
  );
  const auditor=(await pool.query(`SELECT 1 FROM user_establishment_roles uer JOIN roles r ON r.id=uer.role_id WHERE uer.user_id=$1 AND r.code='AUDITOR' UNION SELECT 1 FROM audit_missions WHERE auditor_user_id=$1 LIMIT 1`,[user.sub])).rowCount;
  const auditManager=(await pool.query(`SELECT 1 FROM user_agency_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code='AGENCY_ACCOUNTANT' UNION SELECT 1 FROM user_establishment_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code IN('DEPARTMENT_ADMIN','ACADEMY_ADMIN') LIMIT 1`,[user.sub])).rowCount;
  const platform=await isPlatformAdmin(user.sub);
  return { user: {...user, isPlatformAdmin:platform,isAuditor:!!auditor,isAuditManager:!!auditManager||platform}, establishments: memberships.rows, agencies: agencies.rows };
});

app.get("/api/establishments", async (request) => {
  const user = await requireUser(request);
  if (await isPlatformAdmin(user.sub)) {
    const { rows } = await pool.query(`SELECT id,uai,name,kind FROM establishments WHERE active=true ORDER BY name`);
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT e.id, e.uai, e.name, e.kind
       FROM establishments e
       LEFT JOIN user_establishment_roles uer
         ON uer.establishment_id=e.id AND uer.user_id=$1
       LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true
       LEFT JOIN user_agency_roles uar
         ON uar.agency_id=ae.agency_id AND uar.user_id=$1
      WHERE uer.user_id IS NOT NULL OR uar.user_id IS NOT NULL
        OR EXISTS(SELECT 1 FROM audit_missions m JOIN campaigns c ON c.id=m.campaign_id WHERE m.auditor_user_id=$1 AND c.establishment_id=e.id AND m.status IN('PREPARED','OPEN') AND CURRENT_DATE BETWEEN m.valid_from AND m.valid_until)
      ORDER BY e.name`,
    [user.sub]
  );
  return rows;
});

app.get("/api/agencies", async (request) => {
  const user = await requireUser(request);
  if (await isPlatformAdmin(user.sub)) {
    const {rows}=await pool.query(`SELECT a.id,a.name FROM accounting_agencies a WHERE a.active=true ORDER BY a.name`);return rows;
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT a.id, a.name FROM accounting_agencies a JOIN user_agency_roles uar ON uar.agency_id=a.id
      WHERE uar.user_id=$1 AND a.active=true ORDER BY a.name`,[user.sub]); return rows;
});

app.get("/api/agencies/:id/dashboard", async (request, reply) => {
  const user = await requireUser(request);
  const agencyId = (request.params as any).id;
  const allowed = await pool.query(
    `SELECT 1 FROM user_agency_roles WHERE user_id=$1 AND agency_id=$2`,
    [user.sub, agencyId]
  );
  if (!allowed.rowCount) return reply.code(403).send({ error: "FORBIDDEN" });

  const { rows } = await pool.query(
    `SELECT e.id, e.uai, e.name,
            c.id AS campaign_id, c.label, c.status,
            COUNT(q.id)::int AS question_count,
            COUNT(ans.question_id)::int AS answered_count,
            CASE WHEN COUNT(q.id)=0 THEN 0
                 ELSE ROUND(100.0*COUNT(ans.question_id)/COUNT(q.id),1) END AS progress
       FROM agency_establishments ae
       JOIN establishments e ON e.id=ae.establishment_id
       LEFT JOIN campaigns c ON c.establishment_id=e.id AND c.status <> 'ARCHIVED'
       LEFT JOIN questions q ON q.repository_version_id=c.repository_version_id AND q.active=true
       LEFT JOIN (
         SELECT DISTINCT campaign_id, question_id FROM answers
       ) ans ON ans.campaign_id=c.id AND ans.question_id=q.id
      WHERE ae.agency_id=$1 AND ae.active=true
      GROUP BY e.id, c.id
      ORDER BY e.name`,
    [agencyId]
  );
  return rows;
});


app.get("/api/repository-versions", async (request) => {
  await requireUser(request);
  const { rows } = await pool.query(
    `SELECT rv.id, r.code AS repository_code, r.label AS repository_label,
            rv.version, rv.published_at, rv.active,
            COUNT(q.id)::int AS question_count
       FROM repository_versions rv
       JOIN repositories r ON r.id=rv.repository_id
       LEFT JOIN questions q ON q.repository_version_id=rv.id AND q.active=true
      WHERE rv.active=true
      GROUP BY rv.id, r.id
      ORDER BY rv.published_at DESC NULLS LAST, rv.version DESC`
  );
  return rows;
});

app.get("/api/campaigns/:id", async (request, reply) => {
  const user = await requireUser(request);
  const campaignId = (request.params as any).id;
  const { rows } = await pool.query(
    `SELECT c.id, c.establishment_id, e.uai, e.name AS establishment_name,
            c.repository_version_id, rv.version AS repository_version,
           (SELECT count(*)::int FROM questions q2 WHERE q2.repository_version_id=c.repository_version_id AND q2.active=true) AS question_count,
            c.label, c.status, c.created_at, c.updated_at
       FROM campaigns c
       JOIN establishments e ON e.id=c.establishment_id
       JOIN repository_versions rv ON rv.id=c.repository_version_id
      WHERE c.id=$1`,
    [campaignId]
  );
  if (!rows.length) return reply.code(404).send({ error: "NOT_FOUND" });
  const access = await campaignAccess(user.sub,campaignId);
  if (!access?.canRead) return reply.code(403).send({ error: "FORBIDDEN" });
  return rows[0];
});

app.get("/api/campaigns", async (request, reply) => {
  const user = await requireUser(request);
  const establishmentId = (request.query as any).establishmentId;
  if (!establishmentId) return reply.code(400).send({ error: "ESTABLISHMENT_REQUIRED" });
  const access = await establishmentAccess(user.sub, establishmentId);
  if (!access.canRead) return reply.code(403).send({ error: "FORBIDDEN" });

  const { rows } = await pool.query(
    `SELECT c.*, rv.version AS repository_version,
           (SELECT count(*)::int FROM questions q2 WHERE q2.repository_version_id=c.repository_version_id AND q2.active=true) AS question_count
       FROM campaigns c JOIN repository_versions rv ON rv.id=c.repository_version_id
      WHERE c.establishment_id=$1 AND (NOT $3::boolean OR EXISTS(SELECT 1 FROM audit_missions m WHERE m.auditor_user_id=$2 AND m.campaign_id=c.id AND m.status IN('PREPARED','OPEN') AND CURRENT_DATE BETWEEN m.valid_from AND m.valid_until)) ORDER BY c.created_at DESC`,
    [establishmentId,user.sub,access.roles.includes("AUDITOR")&&!access.directRoles.some((r:any)=>r!=="AUDITOR")&&!access.agencyRoles.length]
  );
  return rows;
});

app.post("/api/establishments/:id/ensure-campaign", async (request, reply) => {
  const user = await requireUser(request);
  const establishmentId = (request.params as any).id;
  const access = await establishmentAccess(user.sub, establishmentId);
  if (!access.canWrite) return reply.code(403).send({ error: "FORBIDDEN" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Empêche deux membres du même EPLE de créer simultanément deux campagnes.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [establishmentId]);
    const existing = await client.query(
      `SELECT c.*, rv.version AS repository_version,
              (SELECT count(*)::int FROM questions q2 WHERE q2.repository_version_id=c.repository_version_id AND q2.active=true) AS question_count
         FROM campaigns c JOIN repository_versions rv ON rv.id=c.repository_version_id
        WHERE c.establishment_id=$1 ORDER BY c.created_at DESC LIMIT 1`,
      [establishmentId]
    );
    if (existing.rows.length) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    // En production, une version de référentiel importée peut exister sans avoir
    // encore été marquée active. Ne pas bloquer l'ouverture métier pour ce seul
    // drapeau : préférer l'active, puis la version réellement alimentée la plus récente.
    const repository = await client.query(
      `SELECT rv.id, rv.version, rv.active, COUNT(q.id)::int AS question_count
         FROM repository_versions rv
         JOIN questions q ON q.repository_version_id=rv.id AND q.active=true
        GROUP BY rv.id
        HAVING COUNT(q.id) > 0
        ORDER BY rv.active DESC, COUNT(q.id) DESC, rv.published_at DESC NULLS LAST, rv.version DESC
        LIMIT 1`
    );
    if (!repository.rows.length) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "NO_ACTIVE_REPOSITORY" });
    }

    const now = new Date();
    const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const label = `Campagne PCIF ${year}-${year + 1}`;
    const created = await client.query(
      `INSERT INTO campaigns(establishment_id,repository_version_id,label,status,created_by)
       VALUES($1,$2,$3,'DRAFT',$4)
       RETURNING *`,
      [establishmentId, repository.rows[0].id, label, user.sub]
    );
    await client.query("COMMIT");
    return reply.code(201).send({
      ...created.rows[0],
      repository_version: repository.rows[0].version,
      question_count: Number((await pool.query(
        `SELECT count(*)::int AS n FROM questions WHERE repository_version_id=$1 AND active=true`,
        [repository.rows[0].id]
      )).rows[0].n)
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.post("/api/campaigns", async (request, reply) => {
  const user = await requireUser(request);
  const schema = z.object({
    establishmentId: z.string().uuid(),
    repositoryVersionId: z.string().uuid(),
    label: z.string().min(3).max(120)
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });

  const access = await establishmentAccess(user.sub, parsed.data.establishmentId);
  if (!access.canWrite) return reply.code(403).send({ error: "FORBIDDEN" });

  const { rows } = await pool.query(
    `INSERT INTO campaigns(establishment_id,repository_version_id,label,status,created_by)
     VALUES($1,$2,$3,'DRAFT',$4) RETURNING *`,
    [parsed.data.establishmentId, parsed.data.repositoryVersionId, parsed.data.label, user.sub]
  );
  return reply.code(201).send(rows[0]);
});

app.get("/api/campaigns/:id/questions", async (request, reply) => {
  const user = await requireUser(request);
  const campaignId = (request.params as any).id;
  const c = await pool.query(`SELECT * FROM campaigns WHERE id=$1`, [campaignId]);
  if (!c.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
  const access = await campaignAccess(user.sub,campaignId);
  if (!access?.canRead) return reply.code(403).send({ error: "FORBIDDEN" });

  const { rows } = await pool.query(
    `SELECT q.id, q.code, q.domain, q.label, q.responsibility, q.weight, q.stars, q.badge,
            COALESCE(jsonb_agg(
              jsonb_build_object(
                'sphere', a.sphere, 'value', a.value, 'comment', a.comment,
                'version', a.version, 'updatedAt', a.updated_at, 'updatedBy', u.display_name
              )
            ) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb) AS answers
       FROM campaigns c
       JOIN questions q ON q.repository_version_id=c.repository_version_id AND q.active=true
       LEFT JOIN answers a ON a.campaign_id=c.id AND a.question_id=q.id
       LEFT JOIN users u ON u.id=a.updated_by
      WHERE c.id=$1
      GROUP BY q.id
      ORDER BY q.sort_order, q.code`,
    [campaignId]
  );
  return rows;
});

app.put("/api/campaigns/:campaignId/answers/:questionId", async (request, reply) => {
  const user = await requireUser(request);
  const { campaignId, questionId } = request.params as any;
  const schema = z.object({
    sphere: z.enum(["ORDONNATEUR", "COMPTABLE", "SYNTHESE"]),
    value: z.number().int().min(0).max(3).nullable(),
    comment: z.string().max(10000).default(""),
    version: z.number().int().min(0).default(0)
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });

  const campaign = await pool.query(`SELECT * FROM campaigns WHERE id=$1`, [campaignId]);
  if (!campaign.rowCount) return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });
  if (["VALIDATED","ARCHIVED"].includes(campaign.rows[0].status)) return reply.code(409).send({ error: "CAMPAIGN_READ_ONLY" });
  const access = await campaignAccess(user.sub,campaignId);
  if (!access?.canWrite) return reply.code(403).send({ error: "FORBIDDEN" });
  if (!canWriteSphere(access, parsed.data.sphere)) {
    return reply.code(403).send({ error: "SPHERE_FORBIDDEN", sphere: parsed.data.sphere });
  }

  try {
    const result = await tx(async client => {
      const current = await client.query(
        `SELECT * FROM answers WHERE campaign_id=$1 AND question_id=$2 AND sphere=$3 FOR UPDATE`,
        [campaignId, questionId, parsed.data.sphere]
      );
      const old = current.rows[0] ?? null;

      if (old && old.version !== parsed.data.version) {
        const err: any = new Error("CONFLICT");
        err.statusCode = 409;
        err.current = old;
        throw err;
      }
      if (!old && parsed.data.version !== 0) {
        const err: any = new Error("CONFLICT");
        err.statusCode = 409;
        throw err;
      }

      const saved = old
        ? await client.query(
            `UPDATE answers
                SET value=$1, comment=$2, version=version+1, updated_by=$3, updated_at=now()
              WHERE id=$4 RETURNING *`,
            [parsed.data.value, parsed.data.comment, user.sub, old.id]
          )
        : await client.query(
            `INSERT INTO answers(campaign_id,question_id,sphere,value,comment,version,updated_by)
             VALUES($1,$2,$3,$4,$5,1,$6) RETURNING *`,
            [campaignId, questionId, parsed.data.sphere, parsed.data.value, parsed.data.comment, user.sub]
          );

      await client.query(
        `INSERT INTO audit_events(user_id,establishment_id,module,entity_type,entity_id,operation,before_data,after_data)
         VALUES($1,$2,'PCIF','ANSWER',$3,$4,$5,$6)`,
        [
          user.sub, campaign.rows[0].establishment_id, saved.rows[0].id,
          old ? "UPDATE" : "CREATE",
          old ? JSON.stringify(old) : null,
          JSON.stringify(saved.rows[0])
        ]
      );
      return saved.rows[0];
    });
    return result;
  } catch (e: any) {
    if (e.statusCode === 409) return reply.code(409).send({ error: "CONFLICT", current: e.current ?? null });
    throw e;
  }
});



// Bibliothèque de ressources — publication hiérarchisée et visibilité héritée.
const resourceSchema = z.object({
  scopeType:z.enum(["PLATFORM","ACADEMY","DEPARTMENT","AGENCY"]), scopeKey:z.string().min(1).max(120),
  title:z.string().trim().min(2).max(240), description:z.string().max(3000).default(""),
  url:z.string().url().max(2000), imageUrl:z.string().url().max(2000).nullable().optional(),
  category:z.string().max(80).default("RESSOURCE"), provider:z.string().max(180).default(""), duration:z.string().max(40).nullable().optional(),
  status:z.enum(["DRAFT","PUBLISHED","ARCHIVED"]).default("PUBLISHED"), sortOrder:z.number().int().min(0).max(9999).default(100)
});
async function resourcePublisherScopes(userId:string){
  if(await isPlatformAdmin(userId)) return [{type:"PLATFORM",key:"*",label:"PCIF Académie · tous les utilisateurs"}];
  const scopes:any[]=[];
  const agencies=await pool.query(`SELECT DISTINCT a.id::text key,a.name label FROM user_agency_roles uar JOIN roles r ON r.id=uar.role_id JOIN accounting_agencies a ON a.id=uar.agency_id WHERE uar.user_id=$1 AND r.code='AGENCY_ACCOUNTANT' AND a.active=true`,[userId]);
  for(const x of agencies.rows)scopes.push({type:"AGENCY",key:x.key,label:`Agence comptable · ${x.label}`});
  const territorial=await pool.query(`SELECT DISTINCT r.code,e.department_code,e.department_name,e.academy_code,e.academy_name FROM user_establishment_roles uer JOIN roles r ON r.id=uer.role_id JOIN establishments e ON e.id=uer.establishment_id WHERE uer.user_id=$1 AND r.code IN('DEPARTMENT_ADMIN','ACADEMY_ADMIN')`,[userId]);
  for(const x of territorial.rows){
    if(x.code==='DEPARTMENT_ADMIN'&&x.department_code)scopes.push({type:"DEPARTMENT",key:x.department_code,label:`Département · ${x.department_name||x.department_code}`});
    if(x.code==='ACADEMY_ADMIN'&&x.academy_code)scopes.push({type:"ACADEMY",key:x.academy_code,label:`Académie · ${x.academy_name||x.academy_code}`});
  }
  return scopes.filter((x,i,a)=>a.findIndex(y=>y.type===x.type&&y.key===x.key)===i);
}
app.get("/api/resources/publisher-scopes",async req=>{const u=await requireUser(req);return resourcePublisherScopes(u.sub)});
app.get("/api/resources",async(req,reply)=>{
  const u=await requireUser(req);const {establishmentId}=req.query as {establishmentId?:string};
  let keys:any={agency:null,department:null,academy:null};
  if(establishmentId){
    const access=await establishmentAccess(u.sub,establishmentId);if(!access.canRead)return reply.code(403).send({error:"FORBIDDEN"});
    const {rows}=await pool.query(`SELECT e.department_code,e.academy_code,ae.agency_id::text agency_id FROM establishments e LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true WHERE e.id=$1`,[establishmentId]);
    if(rows[0])keys={agency:rows[0].agency_id,department:rows[0].department_code,academy:rows[0].academy_code};
  }
  const {rows}=await pool.query(`SELECT r.*,CASE r.scope_type WHEN 'PLATFORM' THEN 'PCIF Académie' WHEN 'ACADEMY' THEN 'Académie' WHEN 'DEPARTMENT' THEN 'Département' ELSE 'Agence comptable' END scope_label FROM shared_resources r WHERE r.status='PUBLISHED' AND ((r.scope_type='PLATFORM' AND r.scope_key='*') OR (r.scope_type='ACADEMY' AND r.scope_key=$1) OR (r.scope_type='DEPARTMENT' AND r.scope_key=$2) OR (r.scope_type='AGENCY' AND r.scope_key=$3)) ORDER BY r.sort_order,r.created_at DESC`,[keys.academy,keys.department,keys.agency]);return rows;
});
app.get("/api/resources/manage",async req=>{const u=await requireUser(req);const scopes=await resourcePublisherScopes(u.sub);if(!scopes.length)return [];const clauses=scopes.map((_,i)=>`(scope_type=$${i*2+1} AND scope_key=$${i*2+2})`).join(' OR '),params=scopes.flatMap(x=>[x.type,x.key]);return (await pool.query(`SELECT * FROM shared_resources WHERE ${clauses} ORDER BY status,sort_order,created_at DESC`,params)).rows});
app.post("/api/resources",async(req,reply)=>{const u=await requireUser(req),p=resourceSchema.safeParse(req.body??{});if(!p.success)return reply.code(400).send({error:"INVALID_RESOURCE"});const scopes=await resourcePublisherScopes(u.sub),x=p.data;if(!scopes.some(s=>s.type===x.scopeType&&s.key===x.scopeKey))return reply.code(403).send({error:"RESOURCE_SCOPE_FORBIDDEN"});const {rows}=await pool.query(`INSERT INTO shared_resources(scope_type,scope_key,title,description,url,image_url,category,provider,duration,status,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[x.scopeType,x.scopeKey,x.title,x.description,x.url,x.imageUrl??null,x.category,x.provider,x.duration??null,x.status,x.sortOrder,u.sub]);return reply.code(201).send(rows[0])});
app.patch("/api/resources/:id",async(req,reply)=>{const u=await requireUser(req),{id}=req.params as {id:string};const old=await pool.query(`SELECT * FROM shared_resources WHERE id=$1`,[id]);if(!old.rowCount)return reply.code(404).send({error:"NOT_FOUND"});const scopes=await resourcePublisherScopes(u.sub);if(!scopes.some(s=>s.type===old.rows[0].scope_type&&s.key===old.rows[0].scope_key))return reply.code(403).send({error:"RESOURCE_SCOPE_FORBIDDEN"});const p=resourceSchema.partial().safeParse(req.body??{});if(!p.success)return reply.code(400).send({error:"INVALID_RESOURCE"});const x={...old.rows[0],...p.data};if(p.data.scopeType||p.data.scopeKey){if(!scopes.some(s=>s.type===(p.data.scopeType??old.rows[0].scope_type)&&s.key===(p.data.scopeKey??old.rows[0].scope_key)))return reply.code(403).send({error:"RESOURCE_SCOPE_FORBIDDEN"})}const {rows}=await pool.query(`UPDATE shared_resources SET scope_type=$2,scope_key=$3,title=$4,description=$5,url=$6,image_url=$7,category=$8,provider=$9,duration=$10,status=$11,sort_order=$12,updated_at=now() WHERE id=$1 RETURNING *`,[id,x.scopeType??x.scope_type,x.scopeKey??x.scope_key,x.title,x.description,x.url,x.imageUrl??x.image_url,x.category,x.provider,x.duration,x.status,x.sortOrder??x.sort_order]);return rows[0]});
app.delete("/api/resources/:id",async(req,reply)=>{const u=await requireUser(req),{id}=req.params as {id:string};const old=await pool.query(`SELECT * FROM shared_resources WHERE id=$1`,[id]);if(!old.rowCount)return reply.code(404).send({error:"NOT_FOUND"});const scopes=await resourcePublisherScopes(u.sub);if(!scopes.some(s=>s.type===old.rows[0].scope_type&&s.key===old.rows[0].scope_key))return reply.code(403).send({error:"RESOURCE_SCOPE_FORBIDDEN"});await pool.query(`DELETE FROM shared_resources WHERE id=$1`,[id]);return reply.code(204).send()});

// Espace personnel — notes strictement privées à l'utilisateur connecté.
const personalNoteSchema = z.object({
  kind: z.enum(["NOTE","PENSE_BETE","A_VERIFIER","IDEE"]).default("NOTE"),
  title: z.string().max(180).default(""), content: z.string().max(10000).default(""),
  pinned: z.boolean().default(false), done: z.boolean().default(false),
  sourceType: z.string().max(40).nullable().optional(), sourceLabel: z.string().max(240).nullable().optional(),
  sourceCampaignId: z.string().uuid().nullable().optional(), sourceWorkshopNo: z.number().int().min(1).max(4).nullable().optional()
});
app.get("/api/me/notes", async (req) => {
  const user = await requireUser(req);
  const { rows } = await pool.query(`SELECT * FROM personal_notes WHERE user_id=$1 ORDER BY pinned DESC, done ASC, updated_at DESC`, [user.sub]);
  return rows;
});
app.post("/api/me/notes", async (req, reply) => {
  const user = await requireUser(req); const parsed=personalNoteSchema.safeParse(req.body ?? {});
  if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTE"}); const n=parsed.data;
  const {rows}=await pool.query(`INSERT INTO personal_notes(user_id,kind,title,content,pinned,done,source_type,source_label,source_campaign_id,source_workshop_no) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[user.sub,n.kind,n.title,n.content,n.pinned,n.done,n.sourceType??null,n.sourceLabel??null,n.sourceCampaignId??null,n.sourceWorkshopNo??null]); return reply.code(201).send(rows[0]);
});
app.patch("/api/me/notes/:id", async (req, reply) => {
  const user=await requireUser(req); const {id}=req.params as {id:string}; const parsed=personalNoteSchema.partial().safeParse(req.body ?? {}); if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTE"});
  const old=await pool.query(`SELECT * FROM personal_notes WHERE id=$1 AND user_id=$2`,[id,user.sub]); if(!old.rowCount)return reply.code(404).send({error:"NOT_FOUND"}); const x={...old.rows[0],...parsed.data};
  const {rows}=await pool.query(`UPDATE personal_notes SET kind=$3,title=$4,content=$5,pinned=$6,done=$7,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`,[id,user.sub,x.kind,x.title,x.content,x.pinned,x.done]); return rows[0];
});
app.delete("/api/me/notes/:id", async (req, reply) => { const user=await requireUser(req); const {id}=req.params as {id:string}; await pool.query(`DELETE FROM personal_notes WHERE id=$1 AND user_id=$2`,[id,user.sub]); return reply.code(204).send(); });

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
await app.listen({ port, host });
