# Contract: `POST /candidate` (alteração aditiva)

Rota já existente (`api/src/routes/candidates.routes.ts`, FEAT-0001). Esta feature altera
apenas o schema `RegisterRequestSchema` (via `AvailabilityStepFields`/`AvailabilityStepSchema`
em `shared/src/schemas/candidate.schema.ts`) — método, path, status codes e demais campos do
request/response não mudam.

## Request — campo novo

```jsonc
{
  // ...campos já existentes (name, email, phone, course, semester, gender,
  // referralSource, referralSourceOther, mejAcknowledged, experience,
  // motivation, saturdayRestriction, ethnicity)...
  "specialNeeds": true,
  "specialNeedsDescription": "Uso cadeira de rodas — preciso de acesso sem escadas até a sala."
}
```

- `specialNeedsDescription`: `string`, opcional no schema, **obrigatório de fato** quando
  `specialNeeds === true` (validado via `superRefine`, não via `.optional()` puro). Trim
  aplicado; string só-com-espaços conta como ausente. Máximo 500 caracteres.
- Quando `specialNeeds === false`: `specialNeedsDescription` é ignorado se enviado (o service
  força `null` na gravação independentemente do valor recebido — FR-004). Não gera erro de
  validação enviá-lo mesmo com `false`, mas ele nunca é persistido nesse caso.

## Response de sucesso (`201`)

**Sem alteração** — `RegisterResponseSchema` não expõe nenhum campo do questionário
(`data.id`, `data.status`, `data.name`, `data.email`, `data.createdAt`), então o campo novo
não aparece na resposta de registro.

## Response de erro (`400`) — novo caso de validação

Quando `specialNeeds: true` e `specialNeedsDescription` ausente/vazio, a resposta segue o
formato padrão de erro de validação do Zod já usado pela rota (via `@hono/zod-openapi`), com
o issue apontando para `specialNeedsDescription` — mesmo mecanismo já em produção para
`referralSourceOther` ausente quando `referralSource === "outros"`. Não é um novo
`CandidateErrorCode` (esses são reservados a conflitos de unicidade E1/E2/E5 e formato de
email/telefone E3/E4) — é validação de shape de payload, tratada no nível `400` padrão da
rota (confirmado no código: `api/test/candidates.routes.test.ts`, casos análogos como
`mejAcknowledged`/`referralSourceOther` já retornam `400`, não `422`), antes de chegar ao
service.

## Contract: `GET /candidates/:id` (detalhe — dashboard)

Rota já existente (`api/src/routes/dashboard.routes.ts`). `CandidateDetailResponseSchema` →
`data.application.specialNeedsDescription: string | null` novo (ver data-model.md). Sem
mudança de status codes.

```jsonc
{
  "data": {
    // ...campos já existentes...
    "application": {
      // ...
      "specialNeeds": true,
      "specialNeedsDescription": "Uso cadeira de rodas — preciso de acesso sem escadas até a sala."
      // ou "specialNeedsDescription": null quando specialNeeds=false OU quando
      // specialNeeds=true mas o candidato é anterior a esta feature (legado).
    }
  }
}
```

Sem mudança de controle de acesso: o campo aparece para qualquer papel que já vê
`application` hoje (não é gated por `includeDemographics`/`role === ADMIN`, ver
Assumption da spec e research.md).

## Contracts que permanecem inalterados (confirmação negativa)

- `GET /dashboard/metrics` (`DashboardMetricsResponseSchema`): `totals.specialNeeds`
  continua um `number` — nenhum texto entra nesta resposta (FR-010).
- `GET /candidates` (listagem, `DashboardCandidatesResponseSchema`): nenhum campo de
  necessidade especial (nem o boolean, nem a descrição) — comportamento já era esse antes
  desta feature, e continua (FR-008).
- `GET /candidates` (rota de check-in, montada por `checkinRouter` em `api/src/index.ts`;
  `CandidateCheckinItemSchema`): idem — sem nenhum campo de necessidade especial, antes e
  depois desta feature (FR-009). Não confundir com `GET /dashboard/candidates` acima
  (listagem do painel) — são rotas diferentes, montadas em prefixos diferentes.
