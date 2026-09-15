import bcrypt from "bcryptjs";
import { FastifyInstance, FastifyRequest } from "fastify";
import {z} from "zod";
import { pool } from "./db.js";
import { JwtUser } from "./types.js";
import {issuePasswordToken,sendPasswordLink,tokenHash} from "./mail.js";

export async function registerAuth(app: FastifyInstance) {
  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email || !body.password) return reply.code(400).send({ error: "EMAIL_PASSWORD_REQUIRED" });

    const { rows } = await pool.query(
      `SELECT id, email, display_name, password_hash, active
       FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL`,
      [body.email]
    );
    const user = rows[0];
    if (!user || !user.active || !(await bcrypt.compare(body.password, user.password_hash))) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }

    const token = app.jwt.sign(
      { sub: user.id, email: user.email, displayName: user.display_name },
      { expiresIn: "8h" }
    );
    return { accessToken: token, tokenType: "Bearer", expiresIn: 28800 };
  });

  app.post("/api/auth/forgot-password",async(request,reply)=>{
    const parsed=z.object({email:z.string().trim().toLowerCase().email()}).safeParse(request.body);
    if(!parsed.success)return reply.code(202).send({accepted:true});
    const {rows}=await pool.query(`SELECT id,email,display_name FROM users WHERE lower(email)=lower($1) AND active=true AND deleted_at IS NULL`,[parsed.data.email]);
    const user=rows[0];
    if(user){
      const recent=await pool.query(`SELECT 1 FROM password_tokens WHERE user_id=$1 AND purpose='RESET' AND created_at>now()-interval '1 minute'`,[user.id]);
      if(!recent.rowCount){try{const token=await issuePasswordToken(user.id,"RESET");await sendPasswordLink(user.email,user.display_name,token,"RESET")}catch(e){request.log.error(e,"Échec de l’envoi du courriel de réinitialisation")}}
    }
    return reply.code(202).send({accepted:true});
  });

  app.post("/api/auth/reset-password",async(request,reply)=>{
    const parsed=z.object({token:z.string().min(32).max(200),password:z.string().min(12).max(200)}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_RESET"});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const {rows}=await client.query(`SELECT id,user_id FROM password_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[tokenHash(parsed.data.token)]);
      if(!rows.length){await client.query("ROLLBACK");return reply.code(400).send({error:"INVALID_OR_EXPIRED_TOKEN"})}
      const hash=await bcrypt.hash(parsed.data.password,12);
      await client.query(`UPDATE users SET password_hash=$1,active=true WHERE id=$2 AND deleted_at IS NULL`,[hash,rows[0].user_id]);
      await client.query(`UPDATE password_tokens SET used_at=now() WHERE id=$1`,[rows[0].id]);
      await client.query(`UPDATE password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,[rows[0].user_id]);
      await client.query("COMMIT");return {updated:true};
    }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
  });
}

export async function requireUser(request: FastifyRequest): Promise<JwtUser> {
  await request.jwtVerify();
  return request.user as JwtUser;
}
