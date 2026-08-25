import {
  RoomListResponseSchema,
  RoomResponseSchema,
  type CreateRoomDTO,
  type RoomSummary,
  type UpdateRoomDTO,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// Mesmo padrão de lib/checkin/api.ts — todas as rotas de /rooms exigem admin.

export async function listRooms(): Promise<RoomSummary[]> {
  const response = await authFetch("/rooms");
  if (!response.ok) throw await toApiError(response);

  return RoomListResponseSchema.parse(await response.json()).data;
}

export async function createRoom(input: CreateRoomDTO): Promise<RoomSummary> {
  const response = await authFetch("/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response);

  return RoomResponseSchema.parse(await response.json()).data;
}

export async function updateRoom(id: string, input: UpdateRoomDTO): Promise<RoomSummary> {
  const response = await authFetch(`/rooms/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response);

  return RoomResponseSchema.parse(await response.json()).data;
}

export async function deleteRoom(id: string): Promise<void> {
  const response = await authFetch(`/rooms/${id}`, { method: "DELETE" });
  if (!response.ok) throw await toApiError(response);
}
