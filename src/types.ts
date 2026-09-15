export type RoleCode =
  | "PLATFORM_ADMIN"
  | "AGENCY_ACCOUNTANT"
  | "AGENCY_DEPUTY"
  | "HEAD"
  | "SECRETARY_GENERAL"
  | "CONTRIBUTOR"
  | "READER"
  | "DEPARTMENT_ADMIN"
  | "ACADEMY_ADMIN"
  | "AUDITOR";

export type Sphere = "ORDONNATEUR" | "COMPTABLE" | "SYNTHESE";

export interface JwtUser {
  sub: string;
  email: string;
  displayName: string;
}
