# Feature Specification: Classificação de salas (comum / anfiteatro)

**Feature Branch**: `claude/room-type-definitions-4812b6`

**Created**: 2026-09-04

**Status**: Implementada

**Input**: Pedido do usuário em 2026-09-04 — "nova definição de sala, sala comum e anfiteatro; se for anfiteatro vai ter 2 hosts e 4 grupos, e se for comum apenas 2 grupos e 1 host; ou seja, não vai ser por quantidade de pessoas mas por classificação da sala". Substitui a decisão D5 (faixas por capacidade) pela D8 no `CONTEXT.md`.

## Objetivo

Host e limite de grupos de uma sala deixam de ser derivados da lotação em pessoas e passam a ser derivados da **classificação** da sala:

| Classificação | Hosts | Grupos (máx.) | Candidatos (máx.) |
|---|---|---|---|
| Sala comum | 1 | 2 | 14 (2 × 7) |
| Anfiteatro | 2 | 4 | 28 (4 × 7) |

O campo `size` (capacidade em pessoas) sai do cadastro, do contrato e do banco — não tem mais nenhum consumidor. A faixa intermediária da D5 (51–80 → 2 hosts / 3 grupos) deixa de existir.

## Contrato (Schemas Compartilhados)

`shared/src/schemas/room.schema.ts`:

- `RoomTypeSchema` / `RoomType` — `"comum" | "anfiteatro"` (novo).
- `ROOM_TYPE_LABEL` — rótulos de exibição (novo).
- `deriveRoomCapacity(type)` — assinatura mudou de `(size: number)` para `(type: RoomType)`.
- `recommendRoomsForGroups(totalGroups)` — cada item do plano ganha `type`; as faixas viram duas (anfiteatro, comum) em vez de três.
- `calculateHostDeficit(roomTypesUsed, hostsPresentCount)` — primeiro parâmetro passou de `number[]` (lotações) para `RoomType[]`.
- `CreateRoomSchema` / `UpdateRoomSchema` / `RoomSummarySchema` — `size` → `type`.

`shared/src/schemas/database.schema.ts`: `RoomRow.size` → `RoomRow.type`.

`shared/src/schemas/group.schema.ts`: `GroupSummarySchema.room` expõe `type` no lugar de `size` (é o que alimenta o diagnóstico de host da simulação, sem round-trip).

## Critérios de Aceite

- [x] Cadastro de sala pede nome + classificação; a lotação em pessoas não é mais pedida nem exibida.
- [x] Sala comum exibe 1 host / 2 grupos; anfiteatro exibe 2 hosts / 4 grupos, em todas as telas que mostram esses números.
- [x] A organização automática usa `maxGroups * 7` como capacidade de candidatos da sala (comum 14, anfiteatro 28) e continua reportando quem ficou sem grupo em vez de estourar o limite.
- [x] O host continua sendo recurso da sala (não do grupo): até `hostCount` hosts por sala, replicados nos grupos dela.
- [x] A simulação (FEAT-0020/0022) calcula déficit de host e plano ideal de salas por classificação.
- [x] Salas já cadastradas são convertidas pela migration, não perdidas: `size > 80` → `anfiteatro`, o resto → `comum`.
- [x] Testes de `shared` e `api` passando (42 e 521, respectivamente).

## Fora de Escopo

- Novas classificações além de comum e anfiteatro.
- Limite por sala configurável manualmente (continua derivado, nunca digitado).
- Reclassificação automática depois da migration — quem tinha 51–80 lugares (2 hosts / 3 grupos na D5) vira `comum` e passa a valer 1 host / 2 grupos; se isso não refletir a sala real, o admin reclassifica na tela de salas.

## Notas para o Agente

- **Migration `0016-room-type.sql`** — `ALTER TABLE ADD COLUMN type` + `UPDATE` de conversão + `ALTER TABLE DROP COLUMN size`, nessa ordem. Não usa `DROP`/`CREATE`: `groups.room_id` referencia `rooms` com `ON DELETE RESTRICT`, e um drop com grupos organizados falharia. `size` é destruída — guarde `SELECT id, name, size FROM rooms` antes de aplicar em staging/produção.
- A capacidade física deixou de existir como conceito. Onde o código dizia `min(size, maxGroups * 7)` agora diz `maxGroups * 7` (`api/src/services/group-organization.ts`).
- `deriveRoomCapacity` continua sendo a **única** fonte de host/grupos, usada igual pela API e pelo front (prévia ao vivo no formulário, diagnóstico da simulação).
