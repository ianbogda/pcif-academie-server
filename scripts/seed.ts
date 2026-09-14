
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const client = await pool.connect();

async function upsertUser(email: string, displayName: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await client.query(
    `INSERT INTO users(email,display_name,password_hash)
     VALUES($1,$2,$3)
     ON CONFLICT(email)
     DO UPDATE SET display_name=excluded.display_name,
                   password_hash=excluded.password_hash,
                   active=true
     RETURNING id`,
    [email, displayName, passwordHash]
  );
  return rows[0].id as string;
}

async function roleId(code: string) {
  const { rows } = await client.query(`SELECT id FROM roles WHERE code=$1`, [code]);
  return rows[0].id as string;
}

try {
  await client.query("BEGIN");

  const roles = [
    ["PLATFORM_ADMIN","Administrateur plateforme"],
    ["AGENCY_ACCOUNTANT","Agent comptable"],
    ["AGENCY_DEPUTY","Fondé de pouvoir"],
    ["HEAD","Chef d'établissement"],
    ["SECRETARY_GENERAL","Secrétaire général"],
    ["CONTRIBUTOR","Contributeur"],
    ["READER","Lecteur"],
    ["AUDITOR","Auditeur"]
  ];

  for (const [code,label] of roles) {
    await client.query(
      `INSERT INTO roles(code,label)
       VALUES($1,$2)
       ON CONFLICT(code) DO UPDATE SET label=excluded.label`,
      [code,label]
    );
  }

  const establishments = [
    ["0280001A","LPO Rémi Belleau Démo","LPO"],
    ["0280002B","Collège Pierre Brossolette Démo","COLLEGE"],
    ["0280003C","Collège Jean Moulin Démo","COLLEGE"],
    ["0280004D","Collège Victor Hugo Démo","COLLEGE"],
    ["0280005E","Collège Jules Ferry Démo","COLLEGE"],
    ["0280006F","Collège Simone Veil Démo","COLLEGE"],
    ["0280007G","LP Sully Démo","LP"],
    ["0280008H","Collège Marcel Proust Démo","COLLEGE"]
  ];

  const establishmentIds: Record<string,string> = {};
  for (const [uai,name,kind] of establishments) {
    const { rows } = await client.query(
      `INSERT INTO establishments(uai,name,kind)
       VALUES($1,$2,$3)
       ON CONFLICT(uai)
       DO UPDATE SET name=excluded.name, kind=excluded.kind, active=true
       RETURNING id`,
      [uai,name,kind]
    );
    establishmentIds[uai] = rows[0].id;
  }

  const supportId = establishmentIds["0280001A"];

  const agency = (await client.query(
    `INSERT INTO accounting_agencies(name,support_establishment_id)
     SELECT 'Agence comptable Rémi Belleau Démo',$1
     WHERE NOT EXISTS(
       SELECT 1 FROM accounting_agencies WHERE name='Agence comptable Rémi Belleau Démo'
     )
     RETURNING id`,
    [supportId]
  )).rows[0] ?? (await client.query(
    `SELECT id FROM accounting_agencies WHERE name='Agence comptable Rémi Belleau Démo'`
  )).rows[0];

  for (const eid of Object.values(establishmentIds)) {
    await client.query(
      `INSERT INTO agency_establishments(agency_id,establishment_id,active)
       VALUES($1,$2,true)
       ON CONFLICT(agency_id, establishment_id)
       DO UPDATE SET active=true`,
      [agency.id,eid]
    );
  }

  const adminId = await upsertUser(
    "admin@example.test",
    "Administrateur plateforme Démo",
    "ChangeMe-ADMIN-2026!"
  );
  await client.query(`UPDATE users SET is_platform_admin=true WHERE id=$1`, [adminId]);
  const acId = await upsertUser(
    "ac@example.test",
    "Agent comptable Démo",
    "ChangeMe-AC-2026!"
  );
  const fpId = await upsertUser(
    "fp@example.test",
    "Fondé de pouvoir Démo",
    "ChangeMe-FP-2026!"
  );
  const ceId = await upsertUser(
    "ce@example.test",
    "Chef d'établissement Démo",
    "ChangeMe-CE-2026!"
  );
  const sgeId = await upsertUser(
    "sge@example.test",
    "Secrétaire général d'EPLE Démo",
    "ChangeMe-SGE-2026!"
  );

  const platformAdminRole = await roleId("PLATFORM_ADMIN");
  const acRole = await roleId("AGENCY_ACCOUNTANT");
  const fpRole = await roleId("AGENCY_DEPUTY");
  const ceRole = await roleId("HEAD");
  const sgeRole = await roleId("SECRETARY_GENERAL");

  // Administrateur : rôle établissement support pour la v0.2 de démo.
  // Le contrôle global PLATFORM_ADMIN sera généralisé dans une prochaine itération.
  await client.query(
    `INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
     VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [adminId,supportId,platformAdminRole]
  );

  // AC et FP : accès transversal aux 8 EPLE via l'agence comptable.
  await client.query(
    `INSERT INTO user_agency_roles(user_id,agency_id,role_id)
     VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [acId,agency.id,acRole]
  );
  await client.query(
    `INSERT INTO user_agency_roles(user_id,agency_id,role_id)
     VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [fpId,agency.id,fpRole]
  );

  // CE et SGE : accès limité à un seul établissement.
  const collegeBrossoletteId = establishmentIds["0280002B"];
  await client.query(
    `INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
     VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [ceId,collegeBrossoletteId,ceRole]
  );
  await client.query(
    `INSERT INTO user_establishment_roles(user_id,establishment_id,role_id)
     VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [sgeId,collegeBrossoletteId,sgeRole]
  );

  const repo = (await client.query(
    `INSERT INTO repositories(code,label)
     VALUES('PCIF','PCIF Académie')
     ON CONFLICT(code) DO UPDATE SET label=excluded.label
     RETURNING id`
  )).rows[0];

  const rv = (await client.query(
    `INSERT INTO repository_versions(repository_id,version,published_at)
     VALUES($1,'DEMO-0.2',CURRENT_DATE)
     ON CONFLICT(repository_id,version)
     DO UPDATE SET active=true
     RETURNING id`,
    [repo.id]
  )).rows[0];

  const qs = [
    ["DEMO-ORDO-001","Démonstration","Question de démonstration — sphère ordonnateur","ORDONNATEUR",6,2,1,10],
    ["DEMO-CPTA-001","Démonstration","Question de démonstration — sphère comptable","COMPTABLE",6,2,1,20],
    ["DEMO-MIX-001","Démonstration","Question de démonstration — responsabilité mixte","MIXTE",9,3,2,30]
  ];

  for (const q of qs) {
    await client.query(
      `INSERT INTO questions(
         repository_version_id,code,domain,label,responsibility,weight,stars,badge,sort_order
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(repository_version_id,code) DO NOTHING`,
      [rv.id,...q]
    );
  }

  // Une campagne ouverte par établissement, utile pour les tests immédiats.
  for (const [uai,eid] of Object.entries(establishmentIds)) {
    await client.query(
      `INSERT INTO campaigns(
         establishment_id,repository_version_id,label,status,created_by
       )
       SELECT $1,$2,$3,'OPEN',$4
       WHERE NOT EXISTS(
         SELECT 1
         FROM campaigns
         WHERE establishment_id=$1
           AND repository_version_id=$2
           AND label=$3
       )`,
      [eid,rv.id,`PCIF Démo 2026-2027 — ${uai}`,adminId]
    );
  }

  await client.query("COMMIT");

  console.log("Seed de démonstration v0.2 créé.");
  console.log("Utilisateurs disponibles :");
  console.log("ADMIN : admin@example.test / ChangeMe-ADMIN-2026!");
  console.log("AC    : ac@example.test / ChangeMe-AC-2026!");
  console.log("FP    : fp@example.test / ChangeMe-FP-2026!");
  console.log("CE    : ce@example.test / ChangeMe-CE-2026!");
  console.log("SGE   : sge@example.test / ChangeMe-SGE-2026!");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
