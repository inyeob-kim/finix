import { apiRequest } from "./client";

export type InstitutionDto = {
  inst_cd: string;
  inst_nm: string;
  is_active: boolean;
  remark?: string | null;
};

export type InstitutionListDto = {
  items: InstitutionDto[];
  total: number;
};

export type LoginRequestDto = {
  username: string;
  role: "qa.editor" | "qa.approver";
  inst_cd: string;
  password?: string;
};

export type LoginResponseDto = {
  username: string;
  role: string;
  inst_cd: string;
  inst_nm: string;
};

export async function listInstitutions(
  activeOnly = true,
): Promise<InstitutionListDto> {
  const q = activeOnly ? "?active_only=true" : "?active_only=false";
  return apiRequest<InstitutionListDto>(`/api/v1/institutions${q}`);
}

export async function loginWithInstitution(
  payload: LoginRequestDto,
): Promise<LoginResponseDto> {
  return apiRequest<LoginResponseDto>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
