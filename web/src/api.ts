export type Me = {
  user: { sub: string; email: string; displayName: string; isPlatformAdmin?: boolean; isAuditor?:boolean;isAuditManager?:boolean };
  establishments: Array<{ id: string; uai: string; name: string; role: string }>;
  agencies: Array<{ id: string; name: string; role: string }>;
};


export type UserAssignment = { establishmentId?:string; establishmentName?:string; uai?:string; agencyId?:string; agencyName?:string; roleCode:string; roleLabel?:string };
export type AdminUser = {
  id:string; email:string; display_name:string; active:boolean; is_platform_admin:boolean;
  created_at:string; assignments:UserAssignment[];audit_scopes?:any[];
};


export type PilotageQuestion = {
  id:string; code:string; domain:string; category?:string; label:string; risk_label?:string;
  responsibility:"ORDONNATEUR"|"COMPTABLE"|"MIXTE"; weight:number;
  pcif_p?:number; pcif_i?:number; gravity?:number; occurrence?:number; is_key?:boolean;
  corrective_label?:string|null; corrective_actions?:string[]; corrective_actors?:string[];
  corrective_deadlines?:string[]; corrective_evaluations?:string[];
  sphere?: "ORDONNATEUR"|"COMPTABLE"|"SYNTHESE"; value?:number|null; comment?:string; version?:number; updated_at?:string; updated_by?:string;
};
export type PcifAction = {
  id:string; campaign_id:string; question_id:string; sphere:string; action_text:string; priority:"P1"|"P2"|"P3"|"P4";
  period?:string|null; actor?:string|null; status:"A_LANCER"|"PREPARATION"|"EN_COURS"|"REALISEE"; target_date?:string|null; note:string;
};
export type WorkshopProgress = {campaign_id:string;workshop_no:number;completed:boolean;notes:string};
export type WorkshopSession = {
  id:string;campaign_id:string;workshop_no:number;session_kind:"INITIALISATION"|"REEXAMEN";
  status:"A_PREPARER"|"EN_COURS"|"TERMINEE"|"A_REINTERROGER";session_date:string;next_review_date?:string|null;
  reason:string;participants:string;notes:string;decisions:string;deliverable:string;
  exit_criteria:Record<string,boolean>;updated_at:string;updated_by_name?:string|null;
};
export type PilotageData = {questions:PilotageQuestion[];actions:PcifAction[];workshops:WorkshopProgress[];workshopSessions:WorkshopSession[];access?:{auditOnly:boolean;canWrite:boolean}};
export type BenchmarkData={current:number|null;agency:BenchmarkCohort;department:BenchmarkCohort;academy:BenchmarkCohort};
export type BenchmarkCohort={count:number;average:number|null;values:number[]};
export type AuditData={campaign:any;observationsAllowed:boolean;findings:{withoutEvidence:any[];divergences:any[];risksWithoutAction:any[];overdueActions:any[];progressions:any[];processesWithoutFormalisation:number;unassignedOperations:number};observations:any[]};


export type OfnActor={id:string;campaign_id:string;name:string;role:string;function_code:string;sphere:"ORDONNATEUR"|"COMPTABLE"|"MIXTE";service:string;source_user_id?:string|null;source:string};
export type OfnAssignment={id:string;campaign_id:string;operation_id:string;actor_id:string;direct_action:boolean;delegation:boolean;substitution:boolean;validates:boolean;controls:boolean;ring?:string|null;note:string};
export type OfnOperation={id:string;name:string;category:string;subcategory:string;sphere:string;processIds?:string[]};
export type PcifProcess={id:string;title:string;domain:string;icon?:string;questionIds:string[];steps:string[];description:string;owner:string;processFamily?:string;macroProcess?:string};
export type ProcessReview={campaign_id:string;process_id:string;priority:boolean;status:"A_EXAMINER"|"EN_COURS"|"SECURISE";note:string};
export type OrganisationData={operations:OfnOperation[];processes:PcifProcess[];actors:OfnActor[];assignments:OfnAssignment[];reviews:ProcessReview[];
 controls:Array<{code:string;domain:string;category?:string;label:string;risk_label?:string;weight:number;gravity?:number;occurrence?:number;value?:number|null;sphere?:string|null}>;
 context?:{establishment_name:string;uai:string;agency_name?:string|null;campaign_label:string};
 suggestedActors?:Array<{user_id:string;name:string;role_code:string;sphere:"ORDONNATEUR"|"COMPTABLE"|"MIXTE"}>;
 versions?:Array<{id:string;version_no:number;label:string;created_at:string}>};

export type AdminEstablishment = Establishment & {active:boolean;agency_id?:string|null;agency_name?:string|null};
export type AdminAgency = {id:string;name:string;support_establishment_id:string;support_name?:string;support_uai?:string;active:boolean;establishments:Establishment[]};

export type Establishment = {
  id: string;
  uai: string;
  name: string;
  kind?: string;
};

export type Campaign = {
  id: string;
  establishment_id: string;
  label: string;
  status: string;
  repository_version: string;
  question_count?: number;
  establishment_name?: string;
};

export type Question = {
  id: string;
  code: string;
  domain: string;
  label: string;
  responsibility: "ORDONNATEUR" | "COMPTABLE" | "MIXTE";
  weight: number;
  category?: string;
  risk_label?: string;
  badge: number;
  is_key?: boolean;
  pcif_p?: number;
  pcif_i?: number;
  stars: number;
  answers: Array<{
    sphere: "ORDONNATEUR" | "COMPTABLE" | "SYNTHESE";
    value: number | null;
    comment: string;
    version: number;
    updatedAt: string;
    updatedBy: string;
  }>;
};

const TOKEN_KEY = "pcif_academie_access_token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) clearToken();

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error ?? `HTTP_${response.status}`) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

async function download(path:string){
  const headers=new Headers(),token=getToken();
  if(token)headers.set("Authorization",`Bearer ${token}`);
  const response=await fetch(path,{headers});
  if(response.status===401)clearToken();
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error??`HTTP_${response.status}`)}
  const disposition=response.headers.get("Content-Disposition")||"",match=disposition.match(/filename="([^"]+)"/);
  const url=URL.createObjectURL(await response.blob()),anchor=document.createElement("a");
  anchor.href=url;anchor.download=match?.[1]||"PCIF_Academie_vers_CARTOPALE.html";anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  forgotPassword:(email:string)=>request<{accepted:boolean}>("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email})}),
  resetPassword:(token:string,password:string)=>request<{updated:boolean}>("/api/auth/reset-password",{method:"POST",body:JSON.stringify({token,password})}),
  me: () => request<Me>("/api/me"),
  establishments: () => request<Establishment[]>("/api/establishments"),
  accessibilityAudits:()=>request<any[]>("/api/admin/accessibility/audits"),
  createAccessibilityAudit:(payload:any)=>request<any>("/api/admin/accessibility/audits",{method:"POST",body:JSON.stringify(payload)}),
  accessibilityAudit:(id:string)=>request<any>(`/api/admin/accessibility/audits/${id}`),
  saveAccessibilityResult:(id:string,code:string,payload:any)=>request<any>(`/api/admin/accessibility/audits/${id}/results/${encodeURIComponent(code)}`,{method:"PUT",body:JSON.stringify(payload)}),
  closeAccessibilityAudit:(id:string)=>request<any>(`/api/admin/accessibility/audits/${id}/close`,{method:"POST"}),
  deleteAccessibilityAudit:(id:string)=>request<void>(`/api/admin/accessibility/audits/${id}`,{method:"DELETE"}),
  publishAccessibilityAudit:(id:string)=>request<any>(`/api/admin/accessibility/audits/${id}/publish`,{method:"POST"}),
  accessibilityReports:()=>request<any[]>("/api/admin/accessibility/reports"),
  unpublishAccessibilityReport:(id:string)=>request<any>(`/api/admin/accessibility/reports/${id}/unpublish`,{method:"POST"}),
  adminUsers: () => request<AdminUser[]>("/api/admin/users"),
  userManagementScope:()=>request<{kind:"ADMIN"|"AC"|"CE";establishments:Establishment[];agencies:Array<{id:string;name:string}>;roles:string[]|null}>("/api/admin/user-management-scope"),
  administrationScope:()=>request<{kind:"ADMIN"|"AC"|"FP";establishments:any[];canManageUsers:boolean;canManageEstablishments:boolean;canManageAgencies:boolean}>("/api/admin/administration-scope"),
  adminDashboard:()=>request<any>("/api/admin/dashboard"),
  adminEstablishments:()=>request<AdminEstablishment[]>("/api/admin/establishments"),
  educationDirectory:(q:string)=>request<any[]>(`/api/admin/education-directory?q=${encodeURIComponent(q)}`),
  importEducationEstablishment:(uai:string)=>request<any>(`/api/admin/education-directory/${encodeURIComponent(uai)}/import`,{method:"POST"}),
  createEstablishment:(payload:any)=>request<AdminEstablishment>("/api/admin/establishments",{method:"POST",body:JSON.stringify(payload)}),
  updateEstablishment:(id:string,payload:any)=>request<AdminEstablishment>(`/api/admin/establishments/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
  adminAgencies:()=>request<AdminAgency[]>("/api/admin/agencies"),
  createAgency:(payload:any)=>request<AdminAgency>("/api/admin/agencies",{method:"POST",body:JSON.stringify(payload)}),
  updateAgency:(id:string,payload:any)=>request<AdminAgency>(`/api/admin/agencies/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
  importAccountingMap:(payload:any)=>request<{agencies:number;members:number}>("/api/admin/agencies/import",{method:"POST",body:JSON.stringify(payload)}),
  adminRoles: () => request<Array<{code:string;label:string}>>("/api/admin/roles"),
  createUser: (payload:any) => request<any>("/api/admin/users",{method:"POST",body:JSON.stringify(payload)}),
  updateUser: (id:string,payload:any) => request<any>(`/api/admin/users/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
  deleteUser: (id:string) => request<void>(`/api/admin/users/${id}`,{method:"DELETE"}),
  sendUserPasswordReset: (id:string) => request<{sent:boolean}>(`/api/admin/users/${id}/send-password-reset`,{method:"POST"}),
  auditorScopes:(id:string)=>request<any[]>(`/api/admin/users/${id}/auditor-scopes`),
  saveAuditorScopes:(id:string,scopes:any[])=>request<any>(`/api/admin/users/${id}/auditor-scopes`,{method:"PUT",body:JSON.stringify({scopes})}),
  agencies: () => request<Array<{ id: string; name: string }>>("/api/agencies"),
  agencyDashboard: (id: string) => request<any[]>(`/api/agencies/${id}/dashboard`),
  campaigns: (establishmentId: string) =>
    request<Campaign[]>(`/api/campaigns?establishmentId=${encodeURIComponent(establishmentId)}`),
  campaign: (id: string) => request<Campaign>(`/api/campaigns/${id}`),
  pilotage: (id:string) => request<PilotageData>(`/api/campaigns/${id}/pilotage`),
  exportCartopale:(id:string)=>download(`/api/campaigns/${id}/export/cartopale`),
  benchmark:(establishmentId:string)=>request<BenchmarkData>(`/api/establishments/${establishmentId}/benchmark`),
  audit:(campaignId:string)=>request<AuditData>(`/api/campaigns/${campaignId}/audit`),
  createAuditObservation:(campaignId:string,payload:any)=>request<any>(`/api/campaigns/${campaignId}/audit/observations`,{method:"POST",body:JSON.stringify(payload)}),
  respondAuditObservation:(campaignId:string,id:string,payload:any)=>request<any>(`/api/campaigns/${campaignId}/audit/observations/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
  auditManagement:()=>request<any>("/api/audit-management/context"),
  createAuditMission:(payload:any)=>request<any>("/api/audit-management/missions",{method:"POST",body:JSON.stringify(payload)}),
  updateAuditMission:(id:string,status:string)=>request<any>(`/api/audit-management/missions/${id}`,{method:"PATCH",body:JSON.stringify({status})}),
  organisation: (id:string) => request<OrganisationData>(`/api/campaigns/${id}/organisation`),
  createOfnActor:(campaignId:string,payload:any)=>request<OfnActor>(`/api/campaigns/${campaignId}/ofn/actors`,{method:"POST",body:JSON.stringify(payload)}),
  updateOfnActor:(campaignId:string,actorId:string,payload:any)=>request<OfnActor>(`/api/campaigns/${campaignId}/ofn/actors/${actorId}`,{method:"PATCH",body:JSON.stringify(payload)}),
  deleteOfnActor:(campaignId:string,actorId:string)=>request<void>(`/api/campaigns/${campaignId}/ofn/actors/${actorId}`,{method:"DELETE"}),
  saveOfnAssignment:(campaignId:string,payload:any)=>request<OfnAssignment>(`/api/campaigns/${campaignId}/ofn/assignments`,{method:"PUT",body:JSON.stringify(payload)}),
  bulkOfnAssignments:(campaignId:string,payload:any)=>request<any>(`/api/campaigns/${campaignId}/ofn/assignments/bulk`,{method:"PUT",body:JSON.stringify(payload)}),
  ofnChecks:(campaignId:string)=>request<any[]>(`/api/campaigns/${campaignId}/ofn/checks`),
  createOfnVersion:(campaignId:string,label:string)=>request<any>(`/api/campaigns/${campaignId}/ofn/versions`,{method:"POST",body:JSON.stringify({label})}),
  deleteOfnAssignment:(campaignId:string,id:string)=>request<void>(`/api/campaigns/${campaignId}/ofn/assignments/${id}`,{method:"DELETE"}),
  saveProcessReview:(campaignId:string,processId:string,payload:any)=>request<ProcessReview>(`/api/campaigns/${campaignId}/processes/${processId}`,{method:"PUT",body:JSON.stringify(payload)}),
  createAction: (campaignId:string,payload:any) => request<PcifAction>(`/api/campaigns/${campaignId}/actions`,{method:"POST",body:JSON.stringify(payload)}),
  updateAction: (campaignId:string,actionId:string,payload:any) => request<PcifAction>(`/api/campaigns/${campaignId}/actions/${actionId}`,{method:"PATCH",body:JSON.stringify(payload)}),
  deleteAction: (campaignId:string,actionId:string) => request<void>(`/api/campaigns/${campaignId}/actions/${actionId}`,{method:"DELETE"}),
  saveWorkshop: (campaignId:string,no:number,payload:any) => request<WorkshopProgress>(`/api/campaigns/${campaignId}/workshops/${no}`,{method:"PUT",body:JSON.stringify(payload)}),
  createWorkshopSession:(campaignId:string,payload:any)=>request<WorkshopSession>(`/api/campaigns/${campaignId}/workshop-sessions`,{method:"POST",body:JSON.stringify(payload)}),
  updateWorkshopSession:(campaignId:string,sessionId:string,payload:any)=>request<WorkshopSession>(`/api/campaigns/${campaignId}/workshop-sessions/${sessionId}`,{method:"PATCH",body:JSON.stringify(payload)}),
  questions: (campaignId: string) => request<Question[]>(`/api/campaigns/${campaignId}/questions`),
  saveAnswer: (
    campaignId: string,
    questionId: string,
    payload: {
      sphere: "ORDONNATEUR" | "COMPTABLE" | "SYNTHESE";
      value: number | null;
      comment: string;
      version: number;
    }
  ) => request<any>(`/api/campaigns/${campaignId}/answers/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  })
};
