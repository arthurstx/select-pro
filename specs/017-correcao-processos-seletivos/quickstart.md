# Quickstart: validação ponta a ponta da 017

Pré-requisitos: `npm install`. Sem migration nova — `selection_processes` já existe
(migration `0006`). Local: `resolveCurrent()` já cria o processo do semestre corrente
sob demanda na primeira chamada de qualquer rota autenticada (ex.: `GET /dashboard/metrics`).

```bash
npm run dev --workspace=api
```

Precisa de um token de admin — mesmo padrão de teste usado no restante do projeto
(`signAccessToken` com `role: "admin"`).

## Cenário 1 — listar processos existentes (US2)

```bash
curl http://localhost:8787/selection-processes -H "Authorization: Bearer <admin>"
# Esperado: 200, data ordenado por starts_at DESC, incluindo pelo menos o processo
# corrente criado pelo resolveCurrent() de alguma chamada anterior
```

## Cenário 2 — corrigir `starts_at` de uma edição (US1, FR-002)

```bash
curl -X PUT http://localhost:8787/selection-processes/<id> -H "Authorization: Bearer <admin>" \
  -H "Content-Type: application/json" \
  -d '{"label":"2026.2","starts_at":"2026-08-01","ends_at":"2026-12-31 23:59:59"}'
# Esperado: 200, starts_at corrigido no data da resposta
```

## Cenário 3 — `starts_at` posterior a `ends_at` (FR-003)

```bash
curl -X PUT http://localhost:8787/selection-processes/<id> -H "Authorization: Bearer <admin>" \
  -H "Content-Type: application/json" \
  -d '{"label":"2026.2","starts_at":"2026-12-31","ends_at":"2026-08-01"}'
# Esperado: 400 VALIDATION_ERROR, nada gravado
```

## Cenário 4 — `label` duplicado (FR-004)

Com dois processos existentes (`2026.1` e `2026.2`), tentar renomear `2026.1` para `"2026.2"`:

```bash
curl -X PUT http://localhost:8787/selection-processes/<id-do-2026.1> \
  -H "Authorization: Bearer <admin>" -H "Content-Type: application/json" \
  -d '{"label":"2026.2","starts_at":"2026-01-01","ends_at":"2026-07-31 23:59:59"}'
# Esperado: 409 SELECTION_PROCESS_LABEL_ALREADY_EXISTS
```

## Cenário 5 — `id` inexistente (FR-005)

```bash
curl -X PUT http://localhost:8787/selection-processes/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer <admin>" -H "Content-Type: application/json" \
  -d '{"label":"x","starts_at":"2026-01-01","ends_at":"2026-07-31"}'
# Esperado: 404 SELECTION_PROCESS_NOT_FOUND
```

## Cenário 6 — corrigir uma edição com dados vinculados não afeta os vínculos (FR-008)

Com candidatos/check-ins já gravados para o processo corrente (ex.: via `POST /candidate/register`
ou `PUT /candidates/:id/checkin`), editar `label`/`starts_at`/`ends_at` desse processo e
confirmar que `GET /dashboard/metrics` continua contando os mesmos candidatos — o `id` do
processo não muda, só os metadados de calendário.

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `selection-process-admin.service.test.ts`, `selection-process.routes.test.ts`.
