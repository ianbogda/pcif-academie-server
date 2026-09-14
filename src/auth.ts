import bcrypt from "bcryptjs";
import { FastifyInstance, FastifyRequest } from "fastify";
import { pool } from "./db.js";
import { JwtUser } from "./types.js";

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
}

export async function requireUser(request: FastifyRequest): Promise<JwtUser> {
  await request.jwtVerify();
  return request.user as JwtUser;
}
