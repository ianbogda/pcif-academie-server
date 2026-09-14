import { pool } from "./db.js";
import { RoleCode, Sphere } from "./types.js";

const WRITE_ROLES: RoleCode[] = [
  "PLATFORM_ADMIN", "AGENCY_ACCOUNTANT", "AGENCY_DEPUTY",
  "HEAD", "SECRETARY_GENERAL", "CONTRIBUTOR"
];

const ORDONNATEUR_ROLES: RoleCode[] = [
  "PLATFORM_ADMIN", "HEAD", "SECRETARY_GENERAL", "CONTRIBUTOR"
];

const COMPTABLE_ROLES: RoleCode[] = [
  "PLATFORM_ADMIN", "AGENCY_ACCOUNTANT", "AGENCY_DEPUTY"
];

export async function establishmentAccess(userId: string, establishmentId: string) {
  const direct = await pool.query(
    `SELECT r.code
       FROM user_establishment_roles uer
       JOIN roles r ON r.id=uer.role_id
      WHERE uer.user_id=$1 AND uer.establishment_id=$2
        AND (uer.valid_from IS NULL OR uer.valid_from <= CURRENT_DATE)
        AND (uer.valid_until IS NULL OR uer.valid_until >= CURRENT_DATE)`,
    [userId, establishmentId]
  );

  const agency = await pool.query(
    `SELECT r.code
       FROM user_agency_roles uar
       JOIN roles r ON r.id=uar.role_id
       JOIN agency_establishments ae ON ae.agency_id=uar.agency_id
      WHERE uar.user_id=$1 AND ae.establishment_id=$2
        AND ae.active=true`,
    [userId, establishmentId]
  );

  const directRoles = direct.rows.map(r => r.code as RoleCode);
  const agencyRoles = agency.rows.map(r => r.code as RoleCode);
  const roles = [...new Set([...directRoles, ...agencyRoles])];

  return {
    canRead: roles.length > 0,
    canWrite: roles.some(r => WRITE_ROLES.includes(r)),
    canWriteOrdonnateur: directRoles.some(r => ORDONNATEUR_ROLES.includes(r)),
    canWriteComptable: agencyRoles.some(r => COMPTABLE_ROLES.includes(r))
      || directRoles.includes("PLATFORM_ADMIN"),
    canWriteSynthese:
      directRoles.some(r => ORDONNATEUR_ROLES.includes(r))
      || agencyRoles.some(r => COMPTABLE_ROLES.includes(r)),
    roles,
    directRoles,
    agencyRoles
  };
}

export function canWriteSphere(
  access: Awaited<ReturnType<typeof establishmentAccess>>,
  sphere: Sphere
) {
  if (sphere === "ORDONNATEUR") return access.canWriteOrdonnateur;
  if (sphere === "COMPTABLE") return access.canWriteComptable;
  return access.canWriteSynthese;
}
