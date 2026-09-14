export type RoleCode =
  | "PLATFORM_ADMIN"
  | "AGENCY_ACCOUNTANT"
  | "AGENCY_DEPUTY"
  | "HEAD"
  | "SECRETARY_GENERAL"
  | "CONTRIBUTOR"
  | "READER"
  | "AUDITOR";

export type Sphere = "ORDONNATEUR" | "COMPTABLE" | "SYNTHESE";

export interface JwtUser {
  sub: string;
  email: string;
  displayName: string;
}
