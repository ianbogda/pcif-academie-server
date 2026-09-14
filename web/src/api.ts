export type Me = {
  user: { sub: string; email: string; displayName: string; isPlatformAdmin?: boolean };
  establishments: Array<{ id: string; uai: string; name: string; role: string }>;
  agencies: Array<{ id: string; name: string; role: string }>;
};


export type UserAssignment = { establishmentId:string; establishmentName?:string; uai?:string; roleCode:string; roleLabel?:string };
export type AdminUser = {
  id:string; email:string; display_name:string; active:boolean; is_platform_admin:boolean;
  created_at:string; assignments:UserAssignment[];
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
export type PilotageData = {questions:PilotageQuestion[];actions:PcifAction[];workshops:WorkshopProgress[]};


export type OfnActor={id:string;campaign_id:string;name:string;role:string;function_code:string};
export type OfnAssignment={id:string;campaign_id:string;operation_id:string;actor_id:string;direct_action:boolean;delegation:boolean;substitution:boolean;ring?:string|null;note:string};
export type OfnOperation={id:string;name:string;category:string;subcategory:string;sphere:string;processIds?:string[]};
export type PcifProcess={id:string;title:string;domain:string;icon?:string;questionIds:string[];steps:string[];description:string;owner:string;processFamily?:string;macroProcess?:string};
export type ProcessReview={campaign_id:string;process_id:string;priority:boolean;status:"A_EXAMINER"|"EN_COURS"|"SECURISE";note:string};
export type OrganisationData={operations:OfnOperation[];processes:PcifProcess[];actors:OfnActor[];assignments:OfnAssignment[];reviews:ProcessReview[]};

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

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: () => request<Me>("/api/me"),
  establishments: () => request<Establishment[]>("/api/establishments"),
  adminUsers: () => request<AdminUser[]>("/api/admin/users"),
  adminEstablishments:()=>request<AdminEstablishment[]>("/api/admin/establishments"),
  createEstablishment:(payload:any)=>request<AdminEstablishment>("/api/admin/establishments",{method:"POST",body:JSON.stringify(payload)}),
  updateEstablishment:(id:string,payload:any)=>request<AdminEstablishment>(`/api/admin/establishments/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
  adminAgencies:()=>request<AdminAgency[]>("/api/admin/agencies"),
  createAgency:(payload:any)=>request<AdminAgency>("/api/admin/agencies",{method:"POST",body:JSON.stringify(payload)}),
  updateAgency:(id:string,payload:any)=>request<AdminAgency>(`/api/admin/agencies/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
  adminRoles: () => request<Array<{code:string;label:string}>>("/api/admin/roles"),
  createUser: (payload:any) => request<any>("/api/admin/users",{method:"POST",body:JSON.stringify(payload)}),
  updateUser: (id:string,payload:any) => request<any>(`/api/admin/users/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
  deleteUser: (id:string) => request<void>(`/api/admin/users/${id}`,{method:"DELETE"}),
  resetUserPassword: (id:string,password?:string) => request<any>(`/api/admin/users/${id}/reset-password`,{method:"POST",body:JSON.stringify(password?{password}:{})}),
  agencies: () => request<Array<{ id: string; name: string }>>("/api/agencies"),
  agencyDashboard: (id: string) => request<any[]>(`/api/agencies/${id}/dashboard`),
  campaigns: (establishmentId: string) =>
    request<Campaign[]>(`/api/campaigns?establishmentId=${encodeURIComponent(establishmentId)}`),
  campaign: (id: string) => request<Campaign>(`/api/campaigns/${id}`),
  pilotage: (id:string) => request<PilotageData>(`/api/campaigns/${id}/pilotage`),
  organisation: (id:string) => request<OrganisationData>(`/api/campaigns/${id}/organisation`),
  createOfnActor:(campaignId:string,payload:any)=>request<OfnActor>(`/api/campaigns/${campaignId}/ofn/actors`,{method:"POST",body:JSON.stringify(payload)}),
  deleteOfnActor:(campaignId:string,actorId:string)=>request<void>(`/api/campaigns/${campaignId}/ofn/actors/${actorId}`,{method:"DELETE"}),
  saveOfnAssignment:(campaignId:string,payload:any)=>request<OfnAssignment>(`/api/campaigns/${campaignId}/ofn/assignments`,{method:"PUT",body:JSON.stringify(payload)}),
  deleteOfnAssignment:(campaignId:string,id:string)=>request<void>(`/api/campaigns/${campaignId}/ofn/assignments/${id}`,{method:"DELETE"}),
  saveProcessReview:(campaignId:string,processId:string,payload:any)=>request<ProcessReview>(`/api/campaigns/${campaignId}/processes/${processId}`,{method:"PUT",body:JSON.stringify(payload)}),
  createAction: (campaignId:string,payload:any) => request<PcifAction>(`/api/campaigns/${campaignId}/actions`,{method:"POST",body:JSON.stringify(payload)}),
  updateAction: (campaignId:string,actionId:string,payload:any) => request<PcifAction>(`/api/campaigns/${campaignId}/actions/${actionId}`,{method:"PATCH",body:JSON.stringify(payload)}),
  deleteAction: (campaignId:string,actionId:string) => request<void>(`/api/campaigns/${campaignId}/actions/${actionId}`,{method:"DELETE"}),
  saveWorkshop: (campaignId:string,no:number,payload:any) => request<WorkshopProgress>(`/api/campaigns/${campaignId}/workshops/${no}`,{method:"PUT",body:JSON.stringify(payload)}),
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
