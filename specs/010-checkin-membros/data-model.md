# Phase 1 Data Model: Check-in de membros

## Novas tabelas (migration `0013-member-checkin.sql`)

### `member_checkins` — estado atual

Espelha `candidate_checkins` (migration `0006`). A existência da linha **é** a presença;
desmarcar apaga a linha. Sem coluna de estado — mesma razão da 0006 ("único fato, única
fonte").

| Coluna          | Tipo | Regras                                                              |
|-----------------|------|----------------------------------------------------------------------|
| `id`            | TEXT | PK                                                                   |
| `user_id`       | TEXT | `NOT NULL REFERENCES users(id) ON DELETE CASCADE`                    |
| `process_id`    | TEXT | `NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE`      |
| `checked_in_by` | TEXT | `NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — quem marcou (admin) |
| `checked_in_at` | TEXT | `NOT NULL DEFAULT (CURRENT_TIMESTAMP)`                               |

`UNIQUE (user_id, process_id)` — mesma pessoa pode ter presença em edições diferentes; nunca
duas linhas na mesma edição.

`user_id` usa `ON DELETE CASCADE` (diferente de `checked_in_by`, que usa `RESTRICT`): se o
próprio avaliador for removido, seu registro de presença não faz mais sentido; mas apagar um
admin não pode apagar em silêncio o registro de quem confirmou presença de outra pessoa —
mesma assimetria já usada em `candidate_checkins`.

### `member_checkin_events` — histórico append-only

Espelha `checkin_events`. Uma linha por mudança real de estado; repetição idempotente
(marcar já marcado, desmarcar já desmarcado) não gera evento — garantido pela mesma técnica
SQL de `WHERE changes() > 0` já usada em `checkin.repository.ts`.

| Coluna       | Tipo | Regras                                                          |
|--------------|------|-------------------------------------------------------------------|
| `id`         | TEXT | PK                                                                 |
| `user_id`    | TEXT | `NOT NULL REFERENCES users(id) ON DELETE CASCADE`                  |
| `process_id` | TEXT | `NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE`    |
| `action`     | TEXT | `NOT NULL CHECK (action IN ('marcou', 'desmarcou'))`               |
| `actor_id`   | TEXT | `NOT NULL REFERENCES users(id) ON DELETE RESTRICT`                 |
| `created_at` | TEXT | `NOT NULL DEFAULT (CURRENT_TIMESTAMP)`                             |

`user_id` usa `CASCADE` (é log de operação, não trilha legal — mesma justificativa da 0006).

### Índices

```sql
CREATE INDEX idx_member_checkins_process ON member_checkins(process_id);
CREATE INDEX idx_member_checkin_events_process ON member_checkin_events(process_id, created_at);
CREATE INDEX idx_member_checkin_events_user ON member_checkin_events(user_id);
```

## Nenhuma tabela existente muda de shape

`candidates`/`applications` não ganham coluna nova — `saturday_restriction` já existe e é
apenas projetada (ver research.md D4), não persistida de outra forma.

## Entidades do domínio (contrato em `shared/`)

### `MemberCheckinItem` (novo, `member-checkin.schema.ts`)

Um avaliador/host da edição corrente, com cargo (reaproveita `EvaluatorRole` de
`evaluator.schema.ts`) e estado de presença:

- `userId: string (uuid)`
- `name: string`
- `email: string`
- `role: EvaluatorRole` (`"avaliador" | "host"`)
- `checkedInAt: string | null` — `null` = ausente, mesma convenção de `CandidateCheckinItem`

### `MemberCheckinListResponse` (novo)

```
data: {
  process: SelectionProcessSummary   // reaproveitado de checkin.schema.ts
  items: MemberCheckinItem[]
  summary: { total: number, checkedIn: number }   // FR-006
}
```

Sem paginação (ver Technical Context — escala de dezenas de itens).

### `CandidateCheckinItem` (alterado, `checkin.schema.ts`)

Ganha um campo:

- `attendance: "online" | "presencial" | null` — `null` quando `checkedInAt` também é
  `null` (candidato ausente não tem modalidade); calculado no service, nunca no banco
  (FR-010).

### Erros

Reaproveita `CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS` (já existe em `checkin.schema.ts`)
para FR-008. Um código novo para FR-009 (edição sem nenhum avaliador/host atribuído) —
`MemberCheckinErrorCode.NO_EVALUATORS_IN_EDITION` — porque é um estado distinto de "sem
processo corrente" (a spec exige diferenciá-los na UI, Edge Cases).

Check-in de usuário que não é avaliador/host da edição corrente (`userId` não encontrado em
`EvaluatorsRepository.listWithRole`) reaproveita o padrão de `EvaluatorErrorCode.EVALUATOR_NOT_FOUND`
— mesmo formato de "id que não corresponde a ninguém elegível" já usado na FEAT-0009.

## Relações reaproveitadas (sem alteração)

- `selection_processes` (FEAT-0005) — mesma resolução de edição corrente
  (`SelectionProcessRepository.resolveCurrent()`), sem mudança de contrato.
- `edition_hosts` (FEAT-0009) — fonte do cargo (avaliador/host); não editada por esta feature.
- `member_profiles`/`users` — fonte de nome/email/status do membro; não editada por esta
  feature.
