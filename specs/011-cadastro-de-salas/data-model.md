# Data Model: Cadastro de salas

## Migration 0009 — `rooms-unique-name.sql` (aditiva, sem `MAINTENANCE_MODE`)

```sql
-- rooms está vazia desde a 0001 (órfã) — índice novo é seguro e imediato.
CREATE UNIQUE INDEX idx_rooms_name ON rooms(name);
```

Nenhuma outra mudança de schema — `rooms(id, name, size)` e
`CHECK (size > 0)` já existem; `groups.room_id ... ON DELETE RESTRICT` já
impede excluir sala com grupo vinculado (R3).

## `shared/src/schemas/room.schema.ts` (novo arquivo)

```ts
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

export const UpdateRoomSchema = CreateRoomSchema; // mesmo shape — PUT substitui os dois campos
export type UpdateRoomDTO = z.infer<typeof UpdateRoomSchema>;

export const RoomSummarySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    size: z.number().int(),
    hostCount: z.number().int(),
    maxGroups: z.number().int(),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

export const RoomListResponseSchema = z.object({ data: z.array(RoomSummarySchema) });
export const RoomResponseSchema = z.object({ data: RoomSummarySchema });

export const RoomErrorCode = {
    ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
    ROOM_NAME_ALREADY_EXISTS: "ROOM_NAME_ALREADY_EXISTS",
    ROOM_HAS_GROUPS: "ROOM_HAS_GROUPS",
} as const;
export type RoomErrorCode = (typeof RoomErrorCode)[keyof typeof RoomErrorCode];
```

`hostCount`/`maxGroups` nunca são persistidos — sempre derivados de `size` na
borda de saída (repository → service → response), via `deriveRoomCapacity`
(R1). O front usa a mesma função para a prévia ao vivo do formulário.

## `api/src/core/errors/room-errors.ts` (novo arquivo)

Mesmo padrão de `auth-errors.ts`: `RoomNotFoundError`, `RoomNameAlreadyExistsError`,
`RoomHasGroupsError`, cada uma com `code` de `RoomErrorCode` e mensagem em
português.

## Contrato HTTP

| Rota | Auth | Request | Response |
|---|---|---|---|
| `GET /rooms` | admin | — | `200` `RoomListResponseSchema` |
| `POST /rooms` | admin | `CreateRoomSchema` | `201` `RoomResponseSchema` / `409 ROOM_NAME_ALREADY_EXISTS` |
| `PUT /rooms/:id` | admin | `UpdateRoomSchema` | `200` `RoomResponseSchema` / `404 ROOM_NOT_FOUND` / `409 ROOM_NAME_ALREADY_EXISTS` |
| `DELETE /rooms/:id` | admin | — | `204` / `404 ROOM_NOT_FOUND` / `409 ROOM_HAS_GROUPS` |
