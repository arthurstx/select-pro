# Contract: Filtro `course` em GET /candidates e GET /dashboard/candidates

Fonte da verdade real: os schemas Zod em `shared/src/schemas/checkin.schema.ts`
e `shared/src/schemas/dashboard.schema.ts` (Princípio I da constitution). Este
arquivo documenta o contrato em prosa para revisão; qualquer divergência entre
este documento e os schemas em `shared/` é resolvida a favor do schema.

## GET /candidates (check-in)

**Novo query param**: `course` (opcional)

- Tipo: um dos valores de `CourseSchema` — `eng-computacao`, `eng-civil`,
  `eng-mecanica`, `eng-quimica`, `eng-producao`, `eng-automacao`,
  `eng-eletrica`, `arquitetura`.
- Ausente → sem filtro de curso (comportamento atual, inalterado).
- Valor fora do enum → `400`, `{"error": {"code": "VALIDATION_ERROR", "message": "Selecione um curso", "field": "course"}}` — mesmo formato de erro já usado por `status`/`search` inválidos nesta rota.
- Combina por E lógico com `search` e `status` já existentes.
- Não muda o shape da resposta (`ListCandidatesResponseSchema`) — `CandidateCheckinItemSchema` já expõe `course` em cada item; o filtro apenas restringe quais itens aparecem.
- Reseta para `page=1` quando o valor de `course` muda — comportamento do cliente (front), não da API (a API sempre respeita o `page` recebido; quem garante o reset é a tela, igual já faz para `status`).

**Exemplo**: `GET /candidates?course=eng-computacao&status=presentes&page=1&per_page=25`

## GET /dashboard/candidates

**Novo query param**: `course` (opcional)

- Mesmo tipo e mesma regra de validação/erro de `GET /candidates`.
- Combina por E lógico com `process_id`, `search`, `from`, `to`, `sort`.
- Não afeta `GET /dashboard/metrics` — filtro é exclusivo da listagem paginada; os agregados (`byCourse` etc.) continuam vindo de uma consulta separada, controlada apenas por `process_id`/`mode`.
- Não muda o shape de `DashboardCandidatesResponseSchema` — `DashboardCandidateItemSchema` já expõe `course`.

**Exemplo**: `GET /dashboard/candidates?course=arquitetura&process_id=all&sort=recent`

## Não afetado (fora de escopo desta feature)

- `GET /dashboard/metrics` — sem novo param.
- `POST /candidates` (inscrição) — `course` já é obrigatório ali, sem relação com filtro de listagem.
- `GET /candidates/{id}` (detalhe) e `GET /dashboard/candidates/{id}` — detalhe de um candidato específico, não passa por filtro de listagem.
