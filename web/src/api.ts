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
  establishment_name?: string;
};

export type Question = {
  id: string;
  code: string;
  domain: string;
  label: string;
  responsibility: "ORDONNATEUR" | "COMPTABLE" | "MIXTE";
  weight: number;
  stars: number;
  badge: number;
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
