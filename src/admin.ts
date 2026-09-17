import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, tx } from "./db.js";
import { requireUser } from "./auth.js";
import { isPlatformAdmin } from "./access.js";
import {issuePasswordToken,sendPasswordLink} from "./mail.js";

async function adminOnly(request:any, reply:any){
  const user=await requireUser(request);
  if(!(await isPlatformAdmin(user.sub))){ reply.code(403).send({error:"ADMIN_REQUIRED"}); return null; }
  return user;
}



async function administrationScope(request:any, reply:any){
  const user=await requireUser(request);
  if(await isPlatformAdmin(user.sub)) return {user,kind:"ADMIN" as const,establishmentIds:null as string[]|null};
  const agency=await pool.query(`SELECT DISTINCT r.code,ae.establishment_id FROM user_agency_roles uar JOIN roles r ON r.id=uar.role_id JOIN agency_establishments ae ON ae.agency_id=uar.agency_id AND ae.active=true WHERE uar.user_id=$1 AND r.code=ANY($2::text[])`,[user.sub,["AGENCY_ACCOUNTANT","AGENCY_DEPUTY"]]);
  if(agency.rowCount){
    const codes=new Set(agency.rows.map((x:any)=>x.code));
    return {user,kind:codes.has("AGENCY_ACCOUNTANT")?"AC" as const:"FP" as const,establishmentIds:[...new Set(agency.rows.map((x:any)=>x.establishment_id))] as string[]};
  }
  reply.code(403).send({error:"ADMINISTRATION_SCOPE_REQUIRED"}); return null;
}

const MANAGED_ROLES_AC = ["AGENCY_ACCOUNTANT","AGENCY_DEPUTY","HEAD","SECRETARY_GENERAL","CONTRIBUTOR"] as const;
const MANAGED_ROLES_CE = ["HEAD","SECRETARY_GENERAL","CONTRIBUTOR"] as const;

async function userManager(request:any, reply:any){
  const user=await requireUser(request);
  if(await isPlatformAdmin(user.sub)) return {user,kind:"ADMIN" as const,establishmentIds:null as string[]|null,roles:null as string[]|null};
  const ac=await pool.query(`SELECT DISTINCT ae.establishment_id FROM user_agency_roles uar JOIN roles r ON r.id=uar.role_id JOIN agency_establishments ae ON ae.agency_id=uar.agency_id AND ae.active=true WHERE uar.user_id=$1 AND r.code='AGENCY_ACCOUNTANT'`,[user.sub]);
  if(ac.rowCount) return {user,kind:"AC" as const,establishmentIds:ac.rows.map((x:any)=>x.establishment_id),roles:[...MANAGED_ROLES_AC]};
  const ce=await pool.query(`SELECT DISTINCT uer.establishment_id FROM user_establishment_roles uer JOIN roles r ON r.id=uer.role_id WHERE uer.user_id=$1 AND r.code='HEAD'`,[user.sub]);
  if(ce.rowCount) return {user,kind:"CE" as const,establishmentIds:ce.rows.map((x:any)=>x.establishment_id),roles:[...MANAGED_ROLES_CE]};
  reply.code(403).send({error:"USER_MANAGER_REQUIRED"}); return null;
}
function validateManagedAssignments(ctx:any, assignments:any[]){
  if(ctx.kind==='ADMIN') return true;
  return assignments.every(a=>ctx.establishmentIds.includes(a.establishmentId)&&ctx.roles.includes(a.roleCode));
}
async function syncAgencyRole(c:any,userId:string,a:any){
  if(!['AGENCY_ACCOUNTANT','AGENCY_DEPUTY'].includes(a.roleCode))return;
  await c.query(`INSERT INTO user_agency_roles(user_id,agency_id,role_id) SELECT $1,ae.agency_id,r.id FROM agency_establishments ae JOIN roles r ON r.code=$3 WHERE ae.establishment_id=$2 AND ae.active=true ON CONFLICT DO NOTHING`,[userId,a.establishmentId,a.roleCode]);
}

const assignment=z.object({establishmentId:z.string().uuid(),roleCode:z.enum([
  "AGENCY_ACCOUNTANT","AGENCY_DEPUTY","HEAD","SECRETARY_GENERAL","CONTRIBUTOR","READER","AUDITOR","DEPARTMENT_ADMIN","ACADEMY_ADMIN"
])});
const userBody=z.object({
  email:z.string().trim().toLowerCase().email(),
  displayName:z.string().trim().min(2).max(120),
  password:z.string().min(12).optional(),
  generatePassword:z.boolean().optional(),
  assignments:z.array(assignment).min(1)
});

export async function registerAdmin(app:FastifyInstance){
  app.get("/api/admin/education-directory",async(request,reply)=>{
    if(!await adminOnly(request,reply))return;
    const q=String((request.query as any)?.q||"").trim();if(q.length<2)return [];
    const {rows}=await pool.query(`SELECT uai,name,establishment_type,nature_label,address,postal_code,city,email,department_name,academy_name,siret,source_updated_at
      FROM education_directory WHERE uai ILIKE $1 OR name ILIKE $1 ORDER BY CASE WHEN uai=$2 THEN 0 ELSE 1 END,name LIMIT 30`,[`%${q}%`,q.toUpperCase()]);
    return rows;
  });
  app.post("/api/admin/education-directory/:uai/import",async(request,reply)=>{
    if(!await adminOnly(request,reply))return;const uai=String((request.params as any).uai||"").toUpperCase();
    const {rows}=await pool.query(`INSERT INTO establishments(uai,name,kind,active,department_code,department_name,academy_code,academy_name,address,postal_code,city,contact_email,siret,directory_synced_at)
      SELECT uai,name,COALESCE(nature_label,establishment_type),true,department_code,department_name,academy_code,academy_name,address,postal_code,city,email,siret,now()
      FROM education_directory WHERE uai=$1 ON CONFLICT(uai) DO UPDATE SET department_code=excluded.department_code,department_name=excluded.department_name,academy_code=excluded.academy_code,academy_name=excluded.academy_name,address=excluded.address,postal_code=excluded.postal_code,city=excluded.city,contact_email=excluded.contact_email,siret=excluded.siret,directory_synced_at=now() RETURNING *`,[uai]);
    if(!rows.length)return reply.code(404).send({error:"UAI_NOT_IN_DIRECTORY"});return reply.code(201).send(rows[0]);
  });
  app.get("/api/admin/establishments",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return;
    const {rows}=await pool.query(`SELECT e.id,e.uai,e.name,e.kind,e.active,e.created_at,e.department_name,e.academy_name,e.city,e.contact_email,e.directory_synced_at,
      a.id AS agency_id,a.name AS agency_name
      FROM establishments e LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true
      LEFT JOIN accounting_agencies a ON a.id=ae.agency_id AND a.active=true ORDER BY e.name`);
    return rows;
  });
  app.post("/api/admin/establishments",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return;
    const p=z.object({uai:z.string().trim().regex(/^[0-9A-Z]{8}$/),name:z.string().trim().min(2).max(180),kind:z.string().trim().max(60).optional()}).safeParse(request.body);
    if(!p.success)return reply.code(400).send({error:"INVALID_ESTABLISHMENT",details:p.error.flatten()});
    try{const {rows}=await pool.query(`INSERT INTO establishments(uai,name,kind,active) VALUES($1,$2,$3,true) RETURNING *`,[p.data.uai,p.data.name,p.data.kind??null]);return reply.code(201).send(rows[0]);}
    catch(e:any){if(e.code==='23505')return reply.code(409).send({error:'UAI_ALREADY_EXISTS'});throw e}
  });
  app.patch("/api/admin/establishments/:id",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return; const id=(request.params as any).id;
    const p=z.object({uai:z.string().trim().regex(/^[0-9A-Z]{8}$/),name:z.string().trim().min(2).max(180),kind:z.string().trim().max(60).nullable().optional(),active:z.boolean()}).safeParse(request.body);
    if(!p.success)return reply.code(400).send({error:"INVALID_ESTABLISHMENT"});
    const {rows}=await pool.query(`UPDATE establishments SET uai=$1,name=$2,kind=$3,active=$4 WHERE id=$5 RETURNING *`,[p.data.uai,p.data.name,p.data.kind??null,p.data.active,id]);
    if(!rows.length)return reply.code(404).send({error:'NOT_FOUND'});return rows[0];
  });
  app.get("/api/admin/agencies",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return;
    const {rows}=await pool.query(`SELECT a.id,a.name,a.support_establishment_id,a.active,a.created_at,
      se.name AS support_name,se.uai AS support_uai,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',e.id,'uai',e.uai,'name',e.name,'kind',e.kind)) FILTER(WHERE e.id IS NOT NULL),'[]'::jsonb) establishments
      FROM accounting_agencies a LEFT JOIN establishments se ON se.id=a.support_establishment_id
      LEFT JOIN agency_establishments ae ON ae.agency_id=a.id AND ae.active=true
      LEFT JOIN establishments e ON e.id=ae.establishment_id
      GROUP BY a.id,se.id ORDER BY a.name`); return rows;
  });
  const agencyBody=z.object({name:z.string().trim().min(3).max(180),supportEstablishmentId:z.string().uuid(),establishmentIds:z.array(z.string().uuid()).min(1),active:z.boolean().default(true)});
  app.post("/api/admin/agencies",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return;const p=agencyBody.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_AGENCY'});
    const r=await tx(async c=>{const {rows}=await c.query(`INSERT INTO accounting_agencies(name,support_establishment_id,active) VALUES($1,$2,$3) RETURNING *`,[p.data.name,p.data.supportEstablishmentId,p.data.active]);
      const ids=[...new Set([p.data.supportEstablishmentId,...p.data.establishmentIds])];for(const eid of ids)await c.query(`INSERT INTO agency_establishments(agency_id,establishment_id,active) VALUES($1,$2,true) ON CONFLICT(agency_id,establishment_id) DO UPDATE SET active=true,valid_until=NULL`,[rows[0].id,eid]);return rows[0]});return reply.code(201).send(r);
  });
  app.patch("/api/admin/agencies/:id",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return;const id=(request.params as any).id,p=agencyBody.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_AGENCY'});
    const r=await tx(async c=>{const {rows}=await c.query(`UPDATE accounting_agencies SET name=$1,support_establishment_id=$2,active=$3 WHERE id=$4 RETURNING *`,[p.data.name,p.data.supportEstablishmentId,p.data.active,id]);if(!rows.length)throw Object.assign(new Error('NOT_FOUND'),{statusCode:404});
      await c.query(`UPDATE agency_establishments SET active=false,valid_until=CURRENT_DATE WHERE agency_id=$1`,[id]);const ids=[...new Set([p.data.supportEstablishmentId,...p.data.establishmentIds])];for(const eid of ids)await c.query(`INSERT INTO agency_establishments(agency_id,establishment_id,active,valid_until) VALUES($1,$2,true,NULL) ON CONFLICT(agency_id,establishment_id) DO UPDATE SET active=true,valid_until=NULL`,[id,eid]);return rows[0]});return r;
  });
  app.post("/api/admin/agencies/import",async(request,reply)=>{
    if(!await adminOnly(request,reply))return;
    const parsed=z.object({replace:z.boolean().default(false),rows:z.array(z.object({supportUai:z.string().regex(/^[0-9A-Z]{8}$/),agencyName:z.string().min(3).max(180),memberUai:z.string().regex(/^[0-9A-Z]{8}$/),validFrom:z.string().date().optional()})).min(1).max(5000)}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_ACCOUNTING_MAP",details:parsed.error.flatten()});
    const result=await tx(async c=>{
      const groups=new Map<string,typeof parsed.data.rows>();for(const row of parsed.data.rows){const key=`${row.supportUai}|${row.agencyName}`;groups.set(key,[...(groups.get(key)||[]),row])}
      let agencies=0,members=0;
      for(const rows of groups.values()){
        const first=rows[0],uais=[...new Set([first.supportUai,...rows.map(x=>x.memberUai)])];
        await c.query(`INSERT INTO establishments(uai,name,kind,active,department_code,department_name,academy_code,academy_name,address,postal_code,city,contact_email,siret,directory_synced_at)
          SELECT uai,name,COALESCE(nature_label,establishment_type),true,department_code,department_name,academy_code,academy_name,address,postal_code,city,email,siret,now() FROM education_directory WHERE uai=ANY($1::text[]) ON CONFLICT(uai) DO NOTHING`,[uais]);
        const found=await c.query(`SELECT id,uai FROM establishments WHERE uai=ANY($1::text[])`,[uais]),byUai=new Map(found.rows.map((x:any)=>[x.uai,x.id]));
        const missing=uais.filter(x=>!byUai.has(x));if(missing.length)throw Object.assign(new Error("UNKNOWN_UAI"),{statusCode:400,missing});
        const supportId=byUai.get(first.supportUai);let agency=(await c.query(`SELECT id FROM accounting_agencies WHERE support_establishment_id=$1 ORDER BY created_at LIMIT 1`,[supportId])).rows[0];
        if(agency)await c.query(`UPDATE accounting_agencies SET name=$1,active=true WHERE id=$2`,[first.agencyName,agency.id]);else agency=(await c.query(`INSERT INTO accounting_agencies(name,support_establishment_id,active) VALUES($1,$2,true) RETURNING id`,[first.agencyName,supportId])).rows[0];
        if(parsed.data.replace)await c.query(`UPDATE agency_establishments SET active=false,valid_until=CURRENT_DATE WHERE agency_id=$1`,[agency.id]);
        for(const row of rows){await c.query(`INSERT INTO agency_establishments(agency_id,establishment_id,active,valid_from,valid_until) VALUES($1,$2,true,COALESCE($3::date,CURRENT_DATE),NULL) ON CONFLICT(agency_id,establishment_id) DO UPDATE SET active=true,valid_from=COALESCE(agency_establishments.valid_from,excluded.valid_from),valid_until=NULL`,[agency.id,byUai.get(row.memberUai),row.validFrom||null]);members++}
        agencies++;
      }
      return {agencies,members};
    }).catch((e:any)=>{if(e.statusCode===400)return reply.code(400).send({error:e.message,missing:e.missing});throw e});
    return result;
  });

  app.get("/api/admin/administration-scope",async(request,reply)=>{
    const ctx=await administrationScope(request,reply);if(!ctx)return;
    if(ctx.kind==='ADMIN')return {kind:ctx.kind,establishments:[],canManageUsers:true,canManageEstablishments:true,canManageAgencies:true};
    const {rows}=await pool.query(`SELECT e.id,e.uai,e.name,e.kind,e.active,e.department_name,e.academy_name,e.city,e.contact_email,a.id AS agency_id,a.name AS agency_name FROM establishments e LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true LEFT JOIN accounting_agencies a ON a.id=ae.agency_id AND a.active=true WHERE e.id=ANY($1::uuid[]) ORDER BY e.name`,[ctx.establishmentIds]);
    return {kind:ctx.kind,establishments:rows,canManageUsers:ctx.kind==='AC',canManageEstablishments:false,canManageAgencies:false};
  });
  app.get("/api/admin/roles",async(request,reply)=>{
    const ctx=await userManager(request,reply); if(!ctx)return;
    const params:any[]=[]; let where=`code<>'PLATFORM_ADMIN'`;
    if(ctx.roles){params.push(ctx.roles);where+=` AND code=ANY($1::text[])`;}
    const {rows}=await pool.query(`SELECT code,label FROM roles WHERE ${where} ORDER BY label`,params);
    return rows;
  });
  app.get("/api/admin/user-management-scope",async(request,reply)=>{
    const ctx=await userManager(request,reply);if(!ctx)return;
    if(ctx.kind==='ADMIN'){const {rows}=await pool.query(`SELECT id,uai,name,kind FROM establishments WHERE active=true ORDER BY name`);return {kind:ctx.kind,establishments:rows,roles:null};}
    const {rows}=await pool.query(`SELECT id,uai,name,kind FROM establishments WHERE id=ANY($1::uuid[]) AND active=true ORDER BY name`,[ctx.establishmentIds]);
    return {kind:ctx.kind,establishments:rows,roles:ctx.roles};
  });
  app.get("/api/admin/users",async(request,reply)=>{
    const ctx=await userManager(request,reply); if(!ctx)return;
    const {rows}=await pool.query(`
      SELECT u.id,u.email,u.display_name,u.active,u.is_platform_admin,u.created_at,u.deleted_at,
      COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.valid_from DESC) FROM auditor_scopes s WHERE s.user_id=u.id),'[]'::jsonb) audit_scopes,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'establishmentId',e.id,'establishmentName',e.name,'uai',e.uai,'roleCode',r.code,'roleLabel',r.label
      )) FILTER(WHERE e.id IS NOT NULL),'[]'::jsonb) assignments
      FROM users u
      LEFT JOIN user_establishment_roles uer ON uer.user_id=u.id
      LEFT JOIN establishments e ON e.id=uer.establishment_id
      LEFT JOIN roles r ON r.id=uer.role_id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id ORDER BY u.display_name`);
    if(ctx.kind==='ADMIN')return rows;
    return rows.filter((u:any)=>u.assignments.some((a:any)=>ctx.establishmentIds.includes(a.establishmentId))).map((u:any)=>({...u,assignments:u.assignments.filter((a:any)=>ctx.establishmentIds.includes(a.establishmentId))}));
  });
  app.get("/api/admin/users/:id/auditor-scopes",async(request,reply)=>{
    if(!await adminOnly(request,reply))return;const id=(request.params as any).id;
    const {rows}=await pool.query(`SELECT s.*,e.name establishment_name,a.name agency_name FROM auditor_scopes s LEFT JOIN establishments e ON e.id=s.establishment_id LEFT JOIN accounting_agencies a ON a.id=s.agency_id WHERE s.user_id=$1 ORDER BY s.valid_from DESC`,[id]);return rows;
  });
  app.put("/api/admin/users/:id/auditor-scopes",async(request,reply)=>{
    if(!await adminOnly(request,reply))return;const id=(request.params as any).id;
    const scope=z.object({scopeType:z.enum(["ESTABLISHMENT","AGENCY","DEPARTMENT","ACADEMY"]),establishmentId:z.string().uuid().nullable().optional(),agencyId:z.string().uuid().nullable().optional(),departmentCode:z.string().max(5).nullable().optional(),academyCode:z.string().max(5).nullable().optional(),validFrom:z.string().date(),validUntil:z.string().date().nullable().optional(),observationsAllowed:z.boolean().default(true)});
    const p=z.object({scopes:z.array(scope).max(100)}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:"INVALID_AUDITOR_SCOPES",details:p.error.flatten()});
    const result=await tx(async c=>{await c.query(`DELETE FROM auditor_scopes WHERE user_id=$1`,[id]);for(const s of p.data.scopes)await c.query(`INSERT INTO auditor_scopes(user_id,scope_type,establishment_id,agency_id,department_code,academy_code,valid_from,valid_until,observations_allowed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,s.scopeType,s.establishmentId??null,s.agencyId??null,s.departmentCode??null,s.academyCode??null,s.validFrom,s.validUntil??null,s.observationsAllowed]);return{updated:p.data.scopes.length}});return result;
  });
  app.post("/api/admin/users",async(request,reply)=>{
    const ctx=await userManager(request,reply); if(!ctx) return;
    const parsed=userBody.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_USER",details:parsed.error.flatten()});
    if(!validateManagedAssignments(ctx,parsed.data.assignments))return reply.code(403).send({error:"ASSIGNMENT_OUT_OF_SCOPE"});
    const generated=!!parsed.data.generatePassword;
    const temp=parsed.data.password??(generated?`Pcif!${randomBytes(12).toString("base64url")}`:randomBytes(32).toString("base64url"));
    const hash=await bcrypt.hash(temp,12);
    try{
      const created=await tx(async c=>{
        const {rows}=await c.query(`INSERT INTO users(email,display_name,password_hash,active) VALUES($1,$2,$3,true) RETURNING id,email,display_name,active`,
          [parsed.data.email,parsed.data.displayName,hash]);
        for(const a of parsed.data.assignments){
          await c.query(`INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
            SELECT $1,$2,id FROM roles WHERE code=$3 ON CONFLICT DO NOTHING`,[rows[0].id,a.establishmentId,a.roleCode]);
          await syncAgencyRole(c,rows[0].id,a);
        }
        return rows[0];
      });
      let emailSent=false;
      if(!parsed.data.password&&!generated){try{const token=await issuePasswordToken(created.id,"ACTIVATION");await sendPasswordLink(created.email,created.display_name,token,"ACTIVATION");emailSent=true}catch(e){request.log.error(e,"Échec de l’envoi du courriel d’activation")}}
      return reply.code(201).send({...created,emailSent,temporaryPassword:generated?temp:undefined});
    }catch(e:any){
      if(e.code==="23505") return reply.code(409).send({error:"EMAIL_ALREADY_EXISTS"});
      throw e;
    }
  });
  app.patch("/api/admin/users/:id",async(request,reply)=>{
    const ctx=await userManager(request,reply); if(!ctx) return;
    const id=(request.params as any).id;
    if(id===ctx.user.sub && (request.body as any)?.active===false) return reply.code(400).send({error:"CANNOT_SUSPEND_SELF"});
    const schema=z.object({
      email:z.string().trim().toLowerCase().email(),
      displayName:z.string().trim().min(2).max(120),
      active:z.boolean(),
      assignments:z.array(assignment).min(1)
    });
    const parsed=schema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_USER",details:parsed.error.flatten()});
    if(!validateManagedAssignments(ctx,parsed.data.assignments))return reply.code(403).send({error:"ASSIGNMENT_OUT_OF_SCOPE"});
    if(ctx.kind!=='ADMIN'){const owned=await pool.query(`SELECT 1 FROM user_establishment_roles WHERE user_id=$1 AND establishment_id=ANY($2::uuid[]) LIMIT 1`,[id,ctx.establishmentIds]);if(!owned.rowCount)return reply.code(403).send({error:"USER_OUT_OF_SCOPE"});}
    try{
      const result=await tx(async c=>{
        const {rows}=await c.query(`UPDATE users SET email=$1,display_name=$2,active=$3 WHERE id=$4 AND deleted_at IS NULL RETURNING id,email,display_name,active,is_platform_admin`,
          [parsed.data.email,parsed.data.displayName,parsed.data.active,id]);
        if(!rows.length) throw Object.assign(new Error("NOT_FOUND"),{statusCode:404});
        if(ctx.kind==='ADMIN'){
          await c.query(`DELETE FROM user_establishment_roles WHERE user_id=$1`,[id]);
          await c.query(`DELETE FROM user_agency_roles WHERE user_id=$1`,[id]);
        }else{
          await c.query(`DELETE FROM user_establishment_roles WHERE user_id=$1 AND establishment_id=ANY($2::uuid[])`,[id,ctx.establishmentIds]);
          await c.query(`DELETE FROM user_agency_roles WHERE user_id=$1 AND agency_id IN(SELECT DISTINCT agency_id FROM agency_establishments WHERE establishment_id=ANY($2::uuid[]) AND active=true)`,[id,ctx.establishmentIds]);
        }
        for(const a of parsed.data.assignments){
          await c.query(`INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
            SELECT $1,$2,id FROM roles WHERE code=$3`,[id,a.establishmentId,a.roleCode]);
          await syncAgencyRole(c,id,a);
        }
        return rows[0];
      });
      return result;
    }catch(e:any){
      if(e.code==="23505") return reply.code(409).send({error:"EMAIL_ALREADY_EXISTS"});
      if(e.statusCode===404) return reply.code(404).send({error:"NOT_FOUND"});
      throw e;
    }
  });
  app.post("/api/admin/users/:id/reset-password",async(request,reply)=>{
    const ctx=await userManager(request,reply);if(!ctx)return;
    const id=(request.params as any).id;
    if(ctx.kind!=='ADMIN'){const owned=await pool.query(`SELECT 1 FROM user_establishment_roles WHERE user_id=$1 AND establishment_id=ANY($2::uuid[]) LIMIT 1`,[id,ctx.establishmentIds]);if(!owned.rowCount)return reply.code(403).send({error:"USER_OUT_OF_SCOPE"});}
    const body=z.object({password:z.string().min(12).optional()}).parse(request.body??{});
    const password=body.password??`Pcif!${randomBytes(9).toString("base64url")}`;
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2 AND deleted_at IS NULL RETURNING id`,[hash,id]);
    if(!r.rowCount) return reply.code(404).send({error:"NOT_FOUND"});
    return {temporaryPassword:password};
  });
  app.delete("/api/admin/users/:id",async(request,reply)=>{
    const ctx=await userManager(request,reply); if(!ctx) return;
    const id=(request.params as any).id;
    if(id===ctx.user.sub) return reply.code(400).send({error:"CANNOT_DELETE_SELF"});
    if(ctx.kind!=='ADMIN'){const owned=await pool.query(`SELECT 1 FROM user_establishment_roles WHERE user_id=$1 AND establishment_id=ANY($2::uuid[]) LIMIT 1`,[id,ctx.establishmentIds]);if(!owned.rowCount)return reply.code(403).send({error:"USER_OUT_OF_SCOPE"});}
    await tx(async c=>{
      if(ctx.kind==='ADMIN'){
        await c.query(`DELETE FROM user_establishment_roles WHERE user_id=$1`,[id]);
        await c.query(`DELETE FROM user_agency_roles WHERE user_id=$1`,[id]);
        await c.query(`UPDATE users SET active=false,deleted_at=now() WHERE id=$1`,[id]);
      }else{
        await c.query(`DELETE FROM user_establishment_roles WHERE user_id=$1 AND establishment_id=ANY($2::uuid[])`,[id,ctx.establishmentIds]);
        await c.query(`DELETE FROM user_agency_roles WHERE user_id=$1 AND agency_id IN(SELECT DISTINCT agency_id FROM agency_establishments WHERE establishment_id=ANY($2::uuid[]) AND active=true)`,[id,ctx.establishmentIds]);
        const left=await c.query(`SELECT 1 FROM user_establishment_roles WHERE user_id=$1 UNION SELECT 1 FROM user_agency_roles WHERE user_id=$1 LIMIT 1`,[id]);
        if(!left.rowCount)await c.query(`UPDATE users SET active=false,deleted_at=now() WHERE id=$1`,[id]);
      }
    });
    return reply.code(204).send();
  });
}
