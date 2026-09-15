import { pool } from "./db.js";
import { RoleCode, Sphere } from "./types.js";

const WRITE_ROLES: RoleCode[] = ["PLATFORM_ADMIN","AGENCY_ACCOUNTANT","AGENCY_DEPUTY","HEAD","SECRETARY_GENERAL","CONTRIBUTOR"];
const ORDONNATEUR_ROLES: RoleCode[] = ["PLATFORM_ADMIN","HEAD","SECRETARY_GENERAL","CONTRIBUTOR"];
const COMPTABLE_ROLES: RoleCode[] = ["PLATFORM_ADMIN","AGENCY_ACCOUNTANT","AGENCY_DEPUTY"];
// AUDITOR est volontairement absent des listes d’écriture : rattachement = lecture seule.

export async function isPlatformAdmin(userId:string){
  const {rows}=await pool.query(`SELECT is_platform_admin FROM users WHERE id=$1 AND active=true AND deleted_at IS NULL`,[userId]);
  return !!rows[0]?.is_platform_admin;
}

export async function establishmentAccess(userId:string, establishmentId:string){
  const admin=await isPlatformAdmin(userId);
  const direct=await pool.query(
    `SELECT r.code FROM user_establishment_roles uer JOIN roles r ON r.id=uer.role_id
     WHERE uer.user_id=$1 AND uer.establishment_id=$2
     AND (uer.valid_from IS NULL OR uer.valid_from<=CURRENT_DATE)
     AND (uer.valid_until IS NULL OR uer.valid_until>=CURRENT_DATE)`,[userId,establishmentId]);
  const agency=await pool.query(
    `SELECT r.code FROM user_agency_roles uar JOIN roles r ON r.id=uar.role_id
     JOIN agency_establishments ae ON ae.agency_id=uar.agency_id
     WHERE uar.user_id=$1 AND ae.establishment_id=$2 AND ae.active=true`,[userId,establishmentId]);

  const directRoles=direct.rows.map(r=>r.code as RoleCode);
  const agencyRoles=agency.rows.map(r=>r.code as RoleCode);
  const mission=await pool.query(`SELECT 1 FROM audit_missions m JOIN campaigns c ON c.id=m.campaign_id WHERE m.auditor_user_id=$1 AND c.establishment_id=$2 AND m.status IN('PREPARED','OPEN') AND CURRENT_DATE BETWEEN m.valid_from AND m.valid_until LIMIT 1`,[userId,establishmentId]);
  const operational=directRoles.filter(r=>r!=="AUDITOR");
  const roles=[...new Set([...directRoles,...agencyRoles,...(mission.rowCount?["AUDITOR" as RoleCode]:[]),...(admin?["PLATFORM_ADMIN" as RoleCode]:[])])];
  return {
    canRead:admin||operational.length>0||agencyRoles.length>0||!!mission.rowCount,
    canWrite:admin||roles.some(r=>WRITE_ROLES.includes(r)),
    canWriteOrdonnateur:admin||directRoles.some(r=>ORDONNATEUR_ROLES.includes(r)),
    canWriteComptable:admin||directRoles.some(r=>COMPTABLE_ROLES.includes(r))||agencyRoles.some(r=>COMPTABLE_ROLES.includes(r)),
    canWriteSynthese:admin||directRoles.some(r=>ORDONNATEUR_ROLES.includes(r)||COMPTABLE_ROLES.includes(r))||agencyRoles.some(r=>COMPTABLE_ROLES.includes(r)),
    roles,directRoles,agencyRoles,isPlatformAdmin:admin
  };
}

export async function campaignAccess(userId:string,campaignId:string){
  const campaign=(await pool.query(`SELECT c.id,c.establishment_id,c.status,e.department_code,e.academy_code,ae.agency_id FROM campaigns c JOIN establishments e ON e.id=c.establishment_id LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true WHERE c.id=$1 LIMIT 1`,[campaignId])).rows[0];
  if(!campaign)return null;
  const base=await establishmentAccess(userId,campaign.establishment_id);
  const mission=(await pool.query(`SELECT id,observations_allowed FROM audit_missions WHERE auditor_user_id=$1 AND campaign_id=$2 AND status IN('PREPARED','OPEN') AND CURRENT_DATE BETWEEN valid_from AND valid_until LIMIT 1`,[userId,campaignId])).rows[0]||null;
  const hasBusinessAccess=base.isPlatformAdmin||base.directRoles.some((r:RoleCode)=>r!=="AUDITOR")||base.agencyRoles.length>0;
  const locked=["VALIDATED","ARCHIVED"].includes(campaign.status);
  return {...base,campaign,mission,isAuditOnly:!!mission&&!hasBusinessAccess,canRead:hasBusinessAccess||!!mission,canWrite:!locked&&hasBusinessAccess&&base.canWrite,canWriteOrdonnateur:!locked&&hasBusinessAccess&&base.canWriteOrdonnateur,canWriteComptable:!locked&&hasBusinessAccess&&base.canWriteComptable,canWriteSynthese:!locked&&hasBusinessAccess&&base.canWriteSynthese};
}

export async function canGrantAuditMission(userId:string,campaignId:string){
  if(await isPlatformAdmin(userId))return true;
  const {rows}=await pool.query(`SELECT 1 FROM campaigns c JOIN establishments e ON e.id=c.establishment_id LEFT JOIN agency_establishments ae ON ae.establishment_id=e.id AND ae.active=true WHERE c.id=$2 AND (
    EXISTS(SELECT 1 FROM user_agency_roles uar JOIN roles r ON r.id=uar.role_id WHERE uar.user_id=$1 AND uar.agency_id=ae.agency_id AND r.code='AGENCY_ACCOUNTANT') OR
    EXISTS(SELECT 1 FROM user_establishment_roles ur JOIN roles r ON r.id=ur.role_id JOIN establishments anchor ON anchor.id=ur.establishment_id WHERE ur.user_id=$1 AND r.code='DEPARTMENT_ADMIN' AND anchor.department_code=e.department_code) OR
    EXISTS(SELECT 1 FROM user_establishment_roles ur JOIN roles r ON r.id=ur.role_id JOIN establishments anchor ON anchor.id=ur.establishment_id WHERE ur.user_id=$1 AND r.code='ACADEMY_ADMIN' AND anchor.academy_code=e.academy_code)) LIMIT 1`,[userId,campaignId]);
  return !!rows.length;
}
export function canWriteSphere(access:Awaited<ReturnType<typeof establishmentAccess>>,sphere:Sphere){
  return sphere==="ORDONNATEUR"?access.canWriteOrdonnateur:sphere==="COMPTABLE"?access.canWriteComptable:access.canWriteSynthese;
}
