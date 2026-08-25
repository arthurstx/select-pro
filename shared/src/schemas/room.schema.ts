import { z } from "zod";

// Salas do processo seletivo (FEAT-0011). `rooms(id, name, size)` existe
// desde a 0001, órfã até esta feature.

/**
 * Hosts e limite de grupos NUNCA são colunas — são derivados da capacidade
 * (D5, CONTEXT.md). Função pura, sem I/O: consumida pela API (monta a
 * response) e pelo front (prévia ao vivo no formulário, sem round-trip —
 * mockup Stitch "Gestão de Salas").
 */
export function deriveRoomCapacity(size: number): { hostCount: number; maxGroups: number } {
    if (size <= 50) return { hostCount: 1, maxGroups: 2 };
    if (size <= 80) return { hostCount: 2, maxGroups: 3 };
    return { hostCount: 2, maxGroups: 4 };
}

export const CreateRoomSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome da sala"),
    size: z.number().int().min(1, "A capacidade deve ser de pelo menos 1 pessoa"),
});
export type CreateRoomDTO = z.infer<typeof CreateRoomSchema>;

/** Mesmo shape do create — `PUT` substitui nome e capacidade juntos (a tela sempre pré-carrega os dois). */
export const UpdateRoomSchema = CreateRoomSchema;
export type UpdateRoomDTO = z.infer<typeof UpdateRoomSchema>;

export const RoomSummarySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    size: z.number().int(),
    hostCount: z.number().int(),
    maxGroups: z.number().int(),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

export const RoomListResponseSchema = z.object({
    data: z.array(RoomSummarySchema),
});
export type RoomListResponse = z.infer<typeof RoomListResponseSchema>;

export const RoomResponseSchema = z.object({
    data: RoomSummarySchema,
});
export type RoomResponse = z.infer<typeof RoomResponseSchema>;

export const RoomErrorCode = {
    ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
    ROOM_NAME_ALREADY_EXISTS: "ROOM_NAME_ALREADY_EXISTS",
    /** FR-009 — `groups.room_id ... ON DELETE RESTRICT` já impede a exclusão; isto só nomeia a violação. */
    ROOM_HAS_GROUPS: "ROOM_HAS_GROUPS",
} as const;
export type RoomErrorCode = (typeof RoomErrorCode)[keyof typeof RoomErrorCode];
