# Contrato: `GroupSummary.room.size`

**Schema afetado**: `GroupSummarySchema` (`shared/src/schemas/group.schema.ts`)

## Antes

```ts
room: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
```

## Depois

```ts
room: z.object({ id: z.string().uuid(), name: z.string(), size: z.number().int() }).nullable(),
```

Mudança aditiva — nenhum consumidor existente quebra (campo a mais em objeto já existente).

## Endpoints afetados (todos já usam `GroupSummarySchema`, nenhuma rota nova aqui)

- `GET /groups`
- `POST /groups/organize/presencial`
- `POST /groups/organize/online`
- `POST /groups/preview/presencial`
- `POST /groups/preview/online` (novo — ver `preview-online.md`)

## Origem do dado

- Prévia (`toPreviewSummary`, sem tocar o banco): já tem `RoomRow` completo em memória
  (`roomById`), só precisa incluir `size: room.size` no objeto montado.
- Organização real (`toSummary`, lê `GroupRow`): `GroupRow` precisa ganhar `room_size: number |
  null`, preenchido pelas 5 queries que hoje fazem `LEFT JOIN rooms r ON r.id = g.room_id` e
  selecionam `r.name AS room_name` — todas passam a selecionar também `r.size AS room_size`
  (`listGroups`, `getGroupRow`, `findGroupById`, `findCandidateGroup`, `findEvaluatorGroup`, em
  `api/src/repositories/group.repository.ts`).
