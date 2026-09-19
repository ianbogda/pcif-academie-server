import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { pool } from "./db.js";
import { requireUser } from "./auth.js";
import { establishmentAccess } from "./access.js";

const VIGIE_BASE_URL=String(process.env.VIGIE_BASE_URL||"").replace(/\/$/,"");
const VIGIE_API_KEY=String(process.env.VIGIE_API_KEY||"");
const VIGIE_TIMEOUT_MS=Math.max(1000,Number(process.env.VIGIE_TIMEOUT_MS||6000));
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");

async function appClient(req:FastifyRequest,scope:string){
  const raw=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!raw)return null;
  const {rows}=await pool.query(`SELECT * FROM integration_clients WHERE active=true AND $1=ANY(scopes)`,[scope]);
  const h=Buffer.from(hash(raw));
  const found=rows.find((x:any)=>{const b=Buffer.from(String(x.key_hash));return b.length===h.length&&timingSafeEqual(b,h)});
  if(found)await pool.query(`UPDATE integration_clients SET last_used_at=now() WHERE id=$1`,[found.id]);
  return found||null;
}
function allowed(client:any,uai:string){return !client.allowed_uais?.length||client.allowed_uais.includes(uai)}

export async function registerIntegrations(app:FastifyInstance){
  app.post("/api/integrations/vigie/summaries",async(req,reply)=>{
    const client=await appClient(req,"vigie:summary:read"); if(!client)return reply.code(401).send({error:"UNAUTHORIZED"});
    const p=z.object({uais:z.array(z.string().min(8).max(9)).max(100)}).safeParse(req.body);if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
    const out:any[]=[];
    for(const uai of [...new Set(p.data.uais.map(x=>x.toUpperCase()))]){
      if(!allowed(client,uai))continue;
      const e=(await pool.query(`SELECT id,uai FROM establishments WHERE upper(uai)=upper($1) AND active=true`,[uai])).rows[0];if(!e)continue;
      const c=(await pool.query(`SELECT id,label,status,repository_version_id,created_at FROM campaigns WHERE establishment_id=$1 AND status<>'ARCHIVED' ORDER BY created_at DESC LIMIT 1`,[e.id])).rows[0];if(!c)continue;
      const masteryFor=async(campaignId:string)=>{
        const row=(await pool.query(`SELECT count(*)::int total,
          count(*) FILTER(WHERE a.value IN(1,2,3))::int answered,
          ROUND(100.0*count(*) FILTER(WHERE a.value IN(1,2,3))/NULLIF(count(*),0))::int completion,
          ROUND(100*(1-COALESCE(SUM(CASE a.value WHEN 1 THEN q.weight WHEN 2 THEN q.weight*.5 ELSE 0 END),0)/NULLIF(SUM(CASE WHEN a.value IN(1,2,3) THEN q.weight ELSE 0 END),0)))::int level
          FROM campaigns c JOIN questions q ON q.repository_version_id=c.repository_version_id AND q.active=true
          LEFT JOIN LATERAL(SELECT value FROM answers WHERE campaign_id=c.id AND question_id=q.id ORDER BY (sphere='SYNTHESE') DESC,updated_at DESC LIMIT 1)a ON true
          WHERE c.id=$1`,[campaignId])).rows[0];
        return {level:row.level??null,completion:Number(row.completion||0),answered:Number(row.answered||0),total:Number(row.total||0)};
      };
      const m=await masteryFor(c.id);
      const previous=(await pool.query(`SELECT id FROM campaigns WHERE establishment_id=$1 AND repository_version_id=$2 AND id<>$3 AND created_at<$4 ORDER BY created_at DESC LIMIT 1`,[e.id,c.repository_version_id,c.id,c.created_at])).rows[0];
      const pm=previous?await masteryFor(previous.id):null;
      const trend=m.level!=null&&pm?.level!=null?m.level-pm.level:null;
      const a=(await pool.query(`SELECT count(*) FILTER(WHERE status<>'REALISEE')::int open,count(*) FILTER(WHERE status<>'REALISEE' AND target_date<CURRENT_DATE)::int overdue FROM pcif_actions WHERE campaign_id=$1 AND selected=true`,[c.id])).rows[0];
      const r=(await pool.query(`SELECT count(*)::int major FROM questions q JOIN campaigns c ON c.repository_version_id=q.repository_version_id LEFT JOIN LATERAL(SELECT value FROM answers WHERE campaign_id=c.id AND question_id=q.id ORDER BY (sphere='SYNTHESE') DESC,updated_at DESC LIMIT 1) a ON true WHERE c.id=$1 AND q.active=true AND COALESCE(q.gravity,0)*COALESCE(q.occurrence,0)>=6 AND COALESCE(a.value,0) IN(1,2)`,[c.id])).rows[0];
      const attention=(await pool.query(`SELECT q.domain label,
        ROUND(100*(1-COALESCE(SUM(CASE a.value WHEN 1 THEN q.weight WHEN 2 THEN q.weight*.5 ELSE 0 END),0)/NULLIF(SUM(CASE WHEN a.value IN(1,2,3) THEN q.weight ELSE 0 END),0)))::int mastery,
        count(*) FILTER(WHERE COALESCE(q.gravity,0)*COALESCE(q.occurrence,0)>=6 AND COALESCE(a.value,0) IN(1,2))::int "majorRisks"
        FROM questions q JOIN campaigns c ON c.repository_version_id=q.repository_version_id
        LEFT JOIN LATERAL(SELECT value FROM answers WHERE campaign_id=c.id AND question_id=q.id ORDER BY (sphere='SYNTHESE') DESC,updated_at DESC LIMIT 1)a ON true
        WHERE c.id=$1 AND q.active=true GROUP BY q.domain
        HAVING count(*) FILTER(WHERE a.value IN(1,2,3))>0
        ORDER BY mastery ASC NULLS LAST,"majorRisks" DESC,q.domain LIMIT 3`,[c.id])).rows;
      const domains=(await pool.query(`SELECT q.domain label,
        count(*)::int total,count(*) FILTER(WHERE a.value IN(1,2,3))::int answered,
        ROUND(100.0*count(*) FILTER(WHERE a.value IN(1,2,3))/NULLIF(count(*),0))::int completion,
        ROUND(100*(1-COALESCE(SUM(CASE a.value WHEN 1 THEN q.weight WHEN 2 THEN q.weight*.5 ELSE 0 END),0)/NULLIF(SUM(CASE WHEN a.value IN(1,2,3) THEN q.weight ELSE 0 END),0)))::int mastery,
        count(*) FILTER(WHERE COALESCE(q.gravity,0)*COALESCE(q.occurrence,0)>=6 AND COALESCE(a.value,0) IN(1,2))::int "majorRisks"
        FROM questions q JOIN campaigns c ON c.repository_version_id=q.repository_version_id
        LEFT JOIN LATERAL(SELECT value FROM answers WHERE campaign_id=c.id AND question_id=q.id ORDER BY (sphere='SYNTHESE') DESC,updated_at DESC LIMIT 1)a ON true
        WHERE c.id=$1 AND q.active=true GROUP BY q.domain ORDER BY q.domain`,[c.id])).rows;
      out.push({uai,campaign:{id:c.id,label:c.label,status:c.status},mastery:{...m,scale:"PERCENT",trend},risks:{major:r.major||0},actions:{open:a.open||0,overdue:a.overdue||0},attention,domains,sourceUrl:`${String(process.env.PUBLIC_APP_URL||"").replace(/\/$/,"")}/`});
    }
    return {contract:"eple-tools/v1",summaries:out};
  });

  app.get("/api/integrations/vigie/status",async req=>{const u=await requireUser(req);return{configured:!!(VIGIE_BASE_URL&&VIGIE_API_KEY),baseUrl:VIGIE_BASE_URL||null,canSync:!!u.sub}});
  app.post("/api/integrations/vigie/sync",async(req,reply)=>{
    const u=await requireUser(req);const p=z.object({establishmentId:z.string().uuid()}).safeParse(req.body);if(!p.success)return reply.code(400).send({error:"INVALID_BODY"});
    const access=await establishmentAccess(u.sub,p.data.establishmentId);if(!access.canWrite)return reply.code(403).send({error:"FORBIDDEN"});
    const e=(await pool.query(`SELECT id,uai FROM establishments WHERE id=$1`,[p.data.establishmentId])).rows[0];if(!e?.uai)return reply.code(409).send({error:"UAI_REQUIRED"});
    if(!VIGIE_BASE_URL||!VIGIE_API_KEY)return reply.code(503).send({error:"VIGIE_NOT_CONFIGURED"});
    const run=(await pool.query(`INSERT INTO integration_sync_runs(provider,direction) VALUES('VIGIE','IN') RETURNING id`)).rows[0];
    try{
      const res=await fetch(`${VIGIE_BASE_URL}/api/eple-tools/v1/signals?uai=${encodeURIComponent(e.uai)}`,{headers:{authorization:`Bearer ${VIGIE_API_KEY}`},signal:AbortSignal.timeout(VIGIE_TIMEOUT_MS)});
      if(!res.ok)throw new Error(`VIGIE_HTTP_${res.status}`);const body:any=await res.json();let imported=0,updated=0;
      for(const s of body.signals||[]){const q=await pool.query(`INSERT INTO external_signals(establishment_id,provider,external_id,domain,process_code,signal_type,severity,title,description,observed_at,raw_payload) VALUES($1,'VIGIE',$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(establishment_id,provider,external_id) DO UPDATE SET domain=excluded.domain,process_code=excluded.process_code,signal_type=excluded.signal_type,severity=excluded.severity,title=excluded.title,description=excluded.description,observed_at=excluded.observed_at,received_at=now(),raw_payload=excluded.raw_payload RETURNING (xmax=0) inserted`,[e.id,s.id,s.domain,s.processCode||null,s.type,s.severity,s.title,s.description||null,s.observedAt,JSON.stringify(s)]);q.rows[0].inserted?imported++:updated++}
      await pool.query(`UPDATE integration_sync_runs SET finished_at=now(),status='SUCCESS',imported=$2,updated=$3 WHERE id=$1`,[run.id,imported,updated]);return{ok:true,imported,updated};
    }catch(err:any){await pool.query(`UPDATE integration_sync_runs SET finished_at=now(),status='ERROR',errors=1,detail=$2::jsonb WHERE id=$1`,[run.id,JSON.stringify({message:err.message})]);return reply.code(502).send({error:err.message})}
  });
  app.get("/api/establishments/:id/signals",async(req,reply)=>{const u=await requireUser(req),id=(req.params as any).id,a=await establishmentAccess(u.sub,id);if(!a.canRead)return reply.code(403).send({error:"FORBIDDEN"});return (await pool.query(`SELECT * FROM external_signals WHERE establishment_id=$1 ORDER BY observed_at DESC`,[id])).rows});
  app.post("/api/signals/:id/acknowledge",async(req,reply)=>{const u=await requireUser(req),id=(req.params as any).id,s=(await pool.query(`SELECT * FROM external_signals WHERE id=$1`,[id])).rows[0];if(!s)return reply.code(404).send({error:"NOT_FOUND"});const a=await establishmentAccess(u.sub,s.establishment_id);if(!a.canWrite)return reply.code(403).send({error:"FORBIDDEN"});return (await pool.query(`UPDATE external_signals SET status='ACKNOWLEDGED' WHERE id=$1 RETURNING *`,[id])).rows[0]});
}
