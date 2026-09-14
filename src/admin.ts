import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, tx } from "./db.js";
import { requireUser } from "./auth.js";
import { isPlatformAdmin } from "./access.js";

async function adminOnly(request:any, reply:any){
  const user=await requireUser(request);
  if(!(await isPlatformAdmin(user.sub))){ reply.code(403).send({error:"ADMIN_REQUIRED"}); return null; }
  return user;
}

const assignment=z.object({establishmentId:z.string().uuid(),roleCode:z.enum([
  "AGENCY_ACCOUNTANT","AGENCY_DEPUTY","HEAD","SECRETARY_GENERAL","CONTRIBUTOR","READER","AUDITOR"
])});
const userBody=z.object({
  email:z.string().trim().toLowerCase().email(),
  displayName:z.string().trim().min(2).max(120),
  password:z.string().min(12).optional(),
  assignments:z.array(assignment).min(1)
});

export async function registerAdmin(app:FastifyInstance){
  app.get("/api/admin/roles",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return;
    const {rows}=await pool.query(`SELECT code,label FROM roles WHERE code<>'PLATFORM_ADMIN' ORDER BY label`);
    return rows;
  });
  app.get("/api/admin/users",async(request,reply)=>{
    if(!await adminOnly(request,reply)) return;
    const {rows}=await pool.query(`
      SELECT u.id,u.email,u.display_name,u.active,u.is_platform_admin,u.created_at,u.deleted_at,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'establishmentId',e.id,'establishmentName',e.name,'uai',e.uai,'roleCode',r.code,'roleLabel',r.label
      )) FILTER(WHERE e.id IS NOT NULL),'[]'::jsonb) assignments
      FROM users u
      LEFT JOIN user_establishment_roles uer ON uer.user_id=u.id
      LEFT JOIN establishments e ON e.id=uer.establishment_id
      LEFT JOIN roles r ON r.id=uer.role_id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id ORDER BY u.display_name`);
    return rows;
  });
  app.post("/api/admin/users",async(request,reply)=>{
    const admin=await adminOnly(request,reply); if(!admin) return;
    const parsed=userBody.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_USER",details:parsed.error.flatten()});
    const temp=parsed.data.password??`Pcif!${randomBytes(9).toString("base64url")}`;
    const hash=await bcrypt.hash(temp,12);
    try{
      const created=await tx(async c=>{
        const {rows}=await c.query(`INSERT INTO users(email,display_name,password_hash,active) VALUES($1,$2,$3,true) RETURNING id,email,display_name,active`,
          [parsed.data.email,parsed.data.displayName,hash]);
        for(const a of parsed.data.assignments){
          await c.query(`INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
            SELECT $1,$2,id FROM roles WHERE code=$3 ON CONFLICT DO NOTHING`,[rows[0].id,a.establishmentId,a.roleCode]);
        }
        return rows[0];
      });
      return reply.code(201).send({...created,temporaryPassword:parsed.data.password?undefined:temp});
    }catch(e:any){
      if(e.code==="23505") return reply.code(409).send({error:"EMAIL_ALREADY_EXISTS"});
      throw e;
    }
  });
  app.patch("/api/admin/users/:id",async(request,reply)=>{
    const admin=await adminOnly(request,reply); if(!admin) return;
    const id=(request.params as any).id;
    if(id===admin.sub && (request.body as any)?.active===false) return reply.code(400).send({error:"CANNOT_SUSPEND_SELF"});
    const schema=z.object({
      email:z.string().trim().toLowerCase().email(),
      displayName:z.string().trim().min(2).max(120),
      active:z.boolean(),
      assignments:z.array(assignment).min(1)
    });
    const parsed=schema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_USER",details:parsed.error.flatten()});
    try{
      const result=await tx(async c=>{
        const {rows}=await c.query(`UPDATE users SET email=$1,display_name=$2,active=$3 WHERE id=$4 AND deleted_at IS NULL RETURNING id,email,display_name,active,is_platform_admin`,
          [parsed.data.email,parsed.data.displayName,parsed.data.active,id]);
        if(!rows.length) throw Object.assign(new Error("NOT_FOUND"),{statusCode:404});
        await c.query(`DELETE FROM user_establishment_roles WHERE user_id=$1`,[id]);
        for(const a of parsed.data.assignments){
          await c.query(`INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
            SELECT $1,$2,id FROM roles WHERE code=$3`,[id,a.establishmentId,a.roleCode]);
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
    if(!await adminOnly(request,reply)) return;
    const id=(request.params as any).id;
    const body=z.object({password:z.string().min(12).optional()}).parse(request.body??{});
    const password=body.password??`Pcif!${randomBytes(9).toString("base64url")}`;
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2 AND deleted_at IS NULL RETURNING id`,[hash,id]);
    if(!r.rowCount) return reply.code(404).send({error:"NOT_FOUND"});
    return {temporaryPassword:password};
  });
  app.delete("/api/admin/users/:id",async(request,reply)=>{
    const admin=await adminOnly(request,reply); if(!admin) return;
    const id=(request.params as any).id;
    if(id===admin.sub) return reply.code(400).send({error:"CANNOT_DELETE_SELF"});
    await tx(async c=>{
      await c.query(`DELETE FROM user_establishment_roles WHERE user_id=$1`,[id]);
      await c.query(`DELETE FROM user_agency_roles WHERE user_id=$1`,[id]);
      await c.query(`UPDATE users SET active=false,deleted_at=now() WHERE id=$1`,[id]);
    });
    return reply.code(204).send();
  });
}
