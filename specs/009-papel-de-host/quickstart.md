# Quickstart: validação ponta a ponta da 009

Pré-requisitos: migration `0010-edition-hosts.sql` aplicada localmente; uma
`selection_processes` cuja janela contenha hoje (a mesma usada por check-in/dashboard).

```bash
npm run dev --workspace=api
```

## Cenário 1 — listar avaliadores, todos aparecem como avaliador por padrão (FR-004)

```bash
curl http://localhost:8787/evaluators -H "Authorization: Bearer <admin>"
```

Esperado: `200`, todos com `role: "avaliador"` (ninguém tem linha em `edition_hosts` ainda).

## Cenário 2 — promover a host (US1)

```bash
curl -X PUT http://localhost:8787/evaluators/<userId>/role \
  -H "Authorization: Bearer <admin>" -H "Content-Type: application/json" \
  -d '{"role":"host"}'
```

Esperado: `200`, `role: "host"`. Repetir `GET /evaluators` confirma a mudança.

## Cenário 3 — voltar a avaliador

```bash
curl -X PUT http://localhost:8787/evaluators/<userId>/role \
  -H "Authorization: Bearer <admin>" -H "Content-Type: application/json" \
  -d '{"role":"avaliador"}'
```

Esperado: `200`, `role: "avaliador"`.

## Cenário 4 — filtro por cargo (US2)

```bash
curl "http://localhost:8787/evaluators?role=host" -H "Authorization: Bearer <admin>"
```

Esperado: só quem está marcado host na edição corrente.

## Cenário 5 — histórico não atravessa edições (FR-005)

Promover alguém a host numa edição, trocar a `selection_processes` corrente manualmente (ou
usar uma segunda edição no teste), e confirmar que a nova edição mostra a pessoa como
avaliador — a linha antiga em `edition_hosts` continua lá, escopada pela edição antiga.

## Cenário 6 — sem processo corrente (FR-008)

Sem nenhuma `selection_processes` cuja janela contenha hoje: `GET /evaluators` responde `404
NO_ACTIVE_SELECTION_PROCESS`, não uma lista vazia.

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `evaluators.service.test.ts`, `evaluators.routes.test.ts`.
