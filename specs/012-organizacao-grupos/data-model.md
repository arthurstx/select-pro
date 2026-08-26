# Data Model — FEAT-0012 Organização automática de grupos

## Tabelas (migration `0014-group-organization.sql`)

Recria `groups`, `group_evaluators`, `group_candidates` (ver research.md D-tech1). Nenhuma
outra tabela é tocada — `rooms`, `candidate_checkins`, `member_checkins`, `edition_hosts`
são apenas lidas.

```sql
CREATE TABLE groups (
  id         TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  room_id    TEXT REFERENCES rooms(id) ON DELETE RESTRICT,  -- NULL = grupo online
  modality   TEXT NOT NULL CHECK (modality IN ('presencial', 'online')),
  name       TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT,

  CHECK (modality = 'presencial' OR room_id IS NULL)
);

CREATE INDEX idx_groups_process ON groups(process_id);
CREATE INDEX idx_groups_room ON groups(room_id);

CREATE TABLE group_evaluators (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  PRIMARY KEY (group_id, user_id),
  UNIQUE (user_id)  -- research.md D-tech3: uma pessoa, um grupo por vez
);

CREATE TABLE group_candidates (
  group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  "order"      INTEGER,

  PRIMARY KEY (group_id, candidate_id),
  UNIQUE (candidate_id)  -- idem
);

CREATE INDEX idx_group_candidates_group ON group_candidates(group_id);
```

`ON DELETE RESTRICT` em `room_id` preserva o comportamento já documentado em
`RoomErrorCode.ROOM_HAS_GROUPS` (FEAT-0011) — agora finalmente exercitado, já que a tabela
deixa de estar órfã.

## Entidades (domínio, não implementação)

- **Grupo**: conjunto de candidatos presentes reunidos para avaliação, escopado à edição
  (`process_id`) e com modalidade fixa (`presencial` ou `online`). Presencial referencia uma
  sala; online não referencia nenhuma. Substituído por completo a cada `POST
  /groups/organize` (FR-011) — nunca editado incrementalmente pelo algoritmo, só pelo ajuste
  manual (US2).
- **Alocação de candidato**: liga um candidato a exatamente um grupo (`UNIQUE
  candidate_id`). Só existem alocações para candidatos com check-in de candidato feito na
  edição corrente (FR-002) — o algoritmo nunca lê `candidates` diretamente, sempre via
  `candidate_checkins`.
- **Alocação de avaliador/host**: liga um avaliador/host a exatamente um grupo (`UNIQUE
  user_id`), só existe para grupos presenciais (FR-007). Candidatos a essa alocação são
  quem tem check-in de membro feito (FEAT-0010, `member_checkins`) na edição corrente —
  hosts (`edition_hosts`) e avaliadores comuns entram no mesmo pool, sem distinção na
  alocação (a distinção de cargo já é exibida, mas não determina a qual grupo alguém vai).
- **Sala**: entidade já existente (FEAT-0011). `deriveRoomCapacity(size)` (já implementado
  em `shared/src/schemas/room.schema.ts`) continua a única fonte de quantos grupos uma sala
  comporta (D5) — reaproveitado sem alteração.

## Fluxo de dados do algoritmo (`GroupOrganizationService.organize`)

Entradas, todas lidas no início da execução (uma "foto" da edição corrente):

1. `SelectionProcessRepository.resolveCurrent()` → edição corrente ou erro
   `NO_ACTIVE_SELECTION_PROCESS` (mesmo padrão já usado em check-in de candidato/membro).
2. Candidatos presentes: `candidate_checkins` `INNER JOIN candidates` `LEFT JOIN
   candidate_applications` (para `saturday_restriction`, mesma derivação de `attendance` já
   usada em `checkin.service.ts`/D7) — traz `id`, `gender`, `attendance`.
3. Avaliadores/hosts presentes: `member_checkins` `INNER JOIN users` `LEFT JOIN
   edition_hosts` — traz `userId`, `role` (mesma query-base de
   `MemberCheckinRepository.listWithCheckin`, mas filtrando só quem tem check-in feito).
4. Salas cadastradas (`RoomsRepository.list()`), ordenadas por `name ASC` (`rooms` não tem
   `created_at`).

Saída: `groups` + `group_candidates` + `group_evaluators` novos, gravados numa única
transação (`db.batch`) que primeiro apaga a organização anterior da edição (`DELETE FROM
groups WHERE process_id = ?`, cascade cuida das duas tabelas de junção) e depois insere a
nova — nunca um estado parcialmente escrito.

## Contrato de resposta (ver `contracts/group-api.md` para os schemas Zod completos)

```
GroupSummary {
  id: string
  modality: "presencial" | "online"
  room: { id, name } | null
  candidates: [{ id, name, attendance }]   // sem `gender` — mesma postura de CandidateCheckinItemSchema (FEAT-0005)
  evaluators: [{ userId, name, role }]   // sempre [] para modality = "online"
}

OrganizeResult {
  groups: GroupSummary[]
  unallocatedCandidateCount: number   // FR-013 — > 0 só quando faltou capacidade de sala
}
```

## Assumptions específicas do algoritmo (complementam as da spec)

- D1 ("nunca exatamente 1 mulher") é definido em termos de `gender = 'feminino'`
  especificamente — candidatos com `gender = 'outro'` entram no mesmo pool de preenchimento
  que `masculino` (não são "mulher" para efeito da regra, nem geram uma regra equivalente
  própria). Isso não estava explícito no backlog; é a leitura mais literal de D1
  ("CONTEXT.md: grupo tem 0 ou ≥2 mulheres") e evita inventar uma terceira regra não pedida.
- O número de grupos-alvo para candidatos **online** (sem sala para ancorar `maxGroups`) usa
  o mesmo tamanho médio de grupo das salas presenciais cadastradas (ou, se não houver
  nenhuma sala cadastrada, um tamanho fixo de referência de 25 pessoas por grupo, o ponto
  médio da primeira faixa de D5) — arredondando para cima o número de grupos necessário.
  Sem isso, não haveria nenhuma base para decidir "quantos grupos online formar" — e US3 exige
  que existam vários, não um único grupo gigante.
- Ordem de desempate ao truncar candidatos presenciais por falta de capacidade (FR-013): por
  horário de check-in (`checked_in_at ASC`) — quem chegou primeiro é alocado primeiro. Mesma
  lógica de "quem chegou primeiro" já implícita no check-in em si.
