# Contrato: Salas

Schemas em `shared/src/schemas/room.schema.ts`. Router `rooms.routes.ts`
montado em `/rooms`, `[requireAuth, requireRole(ROLES.ADMIN)]` em toda rota
(FR-010 — só admin).

## `GET /rooms`

Lista todas as salas, sem paginação (Assumptions — dezenas, não centenas).
`200` `RoomListResponseSchema`, cada item já com `hostCount`/`maxGroups`
calculados (R1).

## `POST /rooms`

Body `CreateRoomSchema`. Checa nome duplicado antes de inserir (R2); o índice
único (`idx_rooms_name`) é a rede de segurança contra corrida.

- `201` `RoomResponseSchema`
- `400` payload inválido (nome vazio, capacidade < 1 — Zod barra antes do banco)
- `409` `ROOM_NAME_ALREADY_EXISTS`

## `PUT /rooms/:id`

Body `UpdateRoomSchema` (mesmo shape do create — substitui nome e capacidade).

- `200` `RoomResponseSchema`
- `404` `ROOM_NOT_FOUND`
- `409` `ROOM_NAME_ALREADY_EXISTS` (renomear para um nome que já existe em outra sala)

## `DELETE /rooms/:id`

- `204`
- `404` `ROOM_NOT_FOUND`
- `409` `ROOM_HAS_GROUPS` — a FK `groups.room_id ... ON DELETE RESTRICT` já
  impede a exclusão (R3); o service traduz a violação, não reimplementa a checagem.
