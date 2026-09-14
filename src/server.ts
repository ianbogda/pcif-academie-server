import { readFileSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import "dotenv/config";
import { pool, tx } from "./db.js";
import { registerAuth, requireUser } from "./auth.js";
import { establishmentAccess, canWriteSphere, isPlatformAdmin } from "./access.js";
import { registerAdmin } from "./admin.js";
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
  return { user: {...user, isPlatformAdmin: await isPlatformAdmin(user.sub)}, establishments: memberships.rows, agencies: agencies.rows };
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
      ORDER BY e.name`,
    [user.sub]
  );
  return rows;
});

app.get("/api/agencies", async (request) => {
  const user = await requireUser(request);
  const { rows } = await pool.query(
    `SELECT DISTINCT a.id, a.name
       FROM accounting_agencies a
       JOIN user_agency_roles uar ON uar.agency_id=a.id
      WHERE uar.user_id=$1 ORDER BY a.name`,
    [user.sub]
  );
  return rows;
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
            c.label, c.status, c.created_at, c.updated_at
       FROM campaigns c
       JOIN establishments e ON e.id=c.establishment_id
       JOIN repository_versions rv ON rv.id=c.repository_version_id
      WHERE c.id=$1`,
    [campaignId]
  );
  if (!rows.length) return reply.code(404).send({ error: "NOT_FOUND" });
  const access = await establishmentAccess(user.sub, rows[0].establishment_id);
  if (!access.canRead) return reply.code(403).send({ error: "FORBIDDEN" });
  return rows[0];
});

app.get("/api/campaigns", async (request, reply) => {
  const user = await requireUser(request);
  const establishmentId = (request.query as any).establishmentId;
  if (!establishmentId) return reply.code(400).send({ error: "ESTABLISHMENT_REQUIRED" });
  const access = await establishmentAccess(user.sub, establishmentId);
  if (!access.canRead) return reply.code(403).send({ error: "FORBIDDEN" });

  const { rows } = await pool.query(
    `SELECT c.*, rv.version AS repository_version
       FROM campaigns c JOIN repository_versions rv ON rv.id=c.repository_version_id
      WHERE c.establishment_id=$1 ORDER BY c.created_at DESC`,
    [establishmentId]
  );
  return rows;
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
  const access = await establishmentAccess(user.sub, c.rows[0].establishment_id);
  if (!access.canRead) return reply.code(403).send({ error: "FORBIDDEN" });

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
  const access = await establishmentAccess(user.sub, campaign.rows[0].establishment_id);
  if (!access.canWrite) return reply.code(403).send({ error: "FORBIDDEN" });
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

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
await app.listen({ port, host });
