# Quickstart: validação ponta a ponta da 010

Pré-requisitos: migration `0013-member-checkin.sql` aplicada localmente; uma
`selection_processes` cuja janela contenha hoje; pelo menos um usuário `avaliador` e um
`host` na edição corrente (FEAT-0009 — `edition_hosts`).

```bash
npm run dev --workspace=api
```

## Cenário 1 — listar avaliadores/hosts, ninguém presente ainda (US1)

```bash
curl http://localhost:8787/member-checkins -H "Authorization: Bearer <admin>"
```

Esperado: `200`, todos com `checkedInAt: null`, `summary.checkedIn: 0`.

## Cenário 2 — marcar check-in (US1)

```bash
curl -X PUT http://localhost:8787/member-checkins/<userId>/checkin \
  -H "Authorization: Bearer <admin>"
```

Esperado: `200`, `checkedInAt` preenchido. Repetir `GET /member-checkins` mostra
`summary.checkedIn` incrementado (US2) e a pessoa como presente.

## Cenário 3 — marcar de novo é idempotente

Repetir o `PUT` do Cenário 2: `200`, mesmo `checkedInAt` da primeira confirmação (sem novo
evento em `member_checkin_events` — conferir por query direta ou pelo teste automatizado).

## Cenário 4 — desmarcar (US1)

```bash
curl -X DELETE http://localhost:8787/member-checkins/<userId>/checkin \
  -H "Authorization: Bearer <admin>"
```

Esperado: `204`. `GET /member-checkins` mostra a pessoa ausente de novo, mas o histórico em
`member_checkin_events` mantém as duas linhas (marcou + desmarcou) — SC-003.

## Cenário 5 — sem processo corrente (FR-008)

Sem nenhuma `selection_processes` cuja janela contenha hoje: `GET /member-checkins` responde
`409 NO_ACTIVE_SELECTION_PROCESS`.

## Cenário 6 — edição sem nenhum avaliador/host atribuído (FR-009)

Com processo corrente mas nenhuma linha relevante em `edition_hosts`/nenhum `avaliador`
ativo: `GET /member-checkins` responde `409 NO_EVALUATORS_IN_EDITION` — código diferente do
Cenário 5.

## Cenário 7 — acesso negado a não-admin (FR-007)

```bash
curl http://localhost:8787/member-checkins -H "Authorization: Bearer <avaliador>"
```

Esperado: `403`.

## Cenário 8 — sinalização online/presencial no check-in de candidatos (US3)

Com um candidato de `saturday_restriction = true` e outro `= false`, ambos com check-in
feito (`PUT /candidates/{id}/checkin`, rota já existente):

```bash
curl "http://localhost:8787/candidates?status=presentes" -H "Authorization: Bearer <admin>"
```

Esperado: `200`, cada item presente com `attendance: "online"` ou `"presencial"` conforme a
restrição de sábado da inscrição; `attendanceSummary` no `data` soma os dois grupos entre os
presentes filtrados. Um candidato ausente na mesma resposta (se `status=todos`) mostra
`attendance: null`.

## Testes automatizados

```bash
npm run test --workspace=api
```

Esperado: `member-checkin.service.test.ts` e `member-checkin.routes.test.ts` cobrindo os
Cenários 1–7 acima; `checkin.service.test.ts`/`checkin.routes.test.ts` (já existentes)
ganham casos novos para o Cenário 8.
