import { apiRequest } from "./client";

export interface ManualChatTurnDto {
  role: "user" | "assistant";
  content: string;
}

export interface ManualSourceSnippetDto {
  header_path: string;
  chunk_index: number;
  preview: string;
}

export interface ManualChatResponseDto {
  answer: string;
  sources: ManualSourceSnippetDto[];
}

export interface ManualStatusDto {
  indexed: boolean;
  chunk_count: number;
  source_checksum: string | null;
  source_path: string;
  reindexed?: boolean | null;
}

export async function getManualStatus(): Promise<ManualStatusDto> {
  return apiRequest<ManualStatusDto>("/api/v1/manual/status", { method: "GET" });
}

export async function postManualChat(payload: {
  message: string;
  history?: ManualChatTurnDto[];
}): Promise<ManualChatResponseDto> {
  return apiRequest<ManualChatResponseDto>("/api/v1/manual/chat", {
    method: "POST",
    body: JSON.stringify({
      message: payload.message,
      history: payload.history ?? [],
    }),
  });
}
