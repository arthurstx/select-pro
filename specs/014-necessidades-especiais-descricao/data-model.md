# Data Model: Descrição de necessidades especiais

## Entidade afetada: `candidate_applications`

Tabela já existente (migration `0002`, redefinida em `0007`), 1:1 com `candidates` via
`candidate_id`. Recebe uma coluna nova, aditiva:

| Coluna                       | Tipo | Nullable | Constraint | Observação |
|-------------------------------|------|----------|------------|------------|
| `special_needs_description`   | TEXT | sim      | nenhuma    | `NULL` quando `special_needs = 0`, ou quando `special_needs = 1` mas o dado é anterior a esta feature (candidato antigo). Tamanho (500 chars) validado só no Zod — mesmo padrão de `referral_source_other`. |

Migration `api/migrations/0011-special-needs-description.sql`:

```sql
ALTER TABLE candidate_applications ADD COLUMN special_needs_description TEXT;
```

Puramente aditiva — sem `CHECK`, sem `DEFAULT`, sem tocar em `UNIQUE`/`FK`. Não exige o
procedimento de reconstrução de tabela (Princípio III) nem janela de manutenção.

## Contrato Zod — request (`shared/src/schemas/candidate.schema.ts`)

`AvailabilityStepFields` (novo objeto plano, substitui o antigo `AvailabilityStepSchema` como
objeto base):

```ts
const AvailabilityStepFields = z.object({
    saturdayRestriction: z.boolean({ errorMap: () => ({ message: "Selecione uma opção" }) }),
    specialNeeds: z.boolean({ errorMap: () => ({ message: "Selecione uma opção" }) }),
    specialNeedsDescription: z.string().trim().max(500, "Máximo de 500 caracteres").optional(),
    ethnicity: EthnicitySchema,
});

const requireDescriptionWhenSpecialNeeds = (
    data: { specialNeeds: boolean; specialNeedsDescription?: string },
    ctx: z.RefinementCtx,
) => {
    if (data.specialNeeds && !data.specialNeedsDescription) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["specialNeedsDescription"],
            message: "Descreva a necessidade especial",
        });
    }
};

export const AvailabilityStepSchema = AvailabilityStepFields.superRefine(requireDescriptionWhenSpecialNeeds);
export type AvailabilityStep = z.infer<typeof AvailabilityStepSchema>;
```

`RegisterRequestSchema` passa a fazer `.merge(AvailabilityStepFields)` (não mais
`.merge(AvailabilityStepSchema)`, pois `ZodEffects` não tem `.merge`) e encadeia
`.superRefine(requireDescriptionWhenSpecialNeeds)` junto do `requireOtherWhenOutros` já
existente.

**Validação**: `.trim()` garante que texto só-com-espaços é tratado como vazio (edge case da
spec). `.optional()` no campo, obrigatoriedade condicional só via `superRefine` — mesma forma
de `referralSourceOther`.

## Contrato Zod — response de detalhe (`shared/src/schemas/dashboard.schema.ts`)

`CandidateApplicationDetailSchema` ganha um campo, seguindo a mesma forma de
`referralSourceOther` (nullable, não opcional — o campo está sempre presente na resposta,
`null` quando não se aplica):

```ts
export const CandidateApplicationDetailSchema = z.object({
    referralSource: ReferralSourceSchema,
    referralSourceOther: z.string().nullable(),
    experience: z.string(),
    motivation: z.string(),
    saturdayRestriction: z.boolean(),
    specialNeeds: z.boolean(),
    specialNeedsDescription: z.string().nullable(),
});
```

`DashboardTotalsSchema` **não muda** — continua só com o contador `specialNeeds: number`
(FR-010). `DashboardCandidateItemSchema` (listagem) e `CandidateCheckinItemSchema`
(check-in) **não mudam** — nenhuma referência ao campo novo entra nesses schemas (FR-008,
FR-009).

## Tipos internos da API (`api/src/repositories/*.ts`)

- `CandidateWithApplicationRow` (sync de planilha) e `NewCandidateApplication`/
  `CandidateApplicationRow` (`shared/src/schemas/database.schema.ts`) ganham
  `special_needs_description: string | null`.
- `DashboardCandidateDetailRow` (`api/src/repositories/dashboard.repository.ts`) ganha
  `special_needs_description: string | null` — lida sempre (não é condicional a
  `includeDemographics`, que só governa `gender`/`ethnicity`).
- `DashboardTotalsRow` **não muda**.

## Fluxo de dados

1. Front (`availability-step-form.tsx`) envia `specialNeedsDescription` só quando
   `specialNeeds = true` (campo escondido/limpo quando `false` — ver FR-004).
2. `POST /candidate` valida via `RegisterRequestSchema` (`@hono/zod-openapi`), rejeitando
   422 se `specialNeeds = true` e descrição ausente/vazia.
3. `CandidateService.register` monta `newApplication.special_needs_description` como
   `input.specialNeeds ? (input.specialNeedsDescription ?? null) : null` — mesmo padrão
   ternário já usado para `referral_source_other`.
4. `CandidateRepository.insertWithApplication` grava a coluna nova no mesmo `INSERT`
   existente (uma coluna a mais no `db.batch`, sem query adicional).
5. `DashboardRepository.findDetail` lê `a.special_needs_description` no mesmo `SELECT` já
   existente (uma coluna a mais, sem query adicional, sem condicional de papel).
6. `DashboardService.detail` mapeia para `application.specialNeedsDescription` no
   `CandidateDetail` retornado.
7. `candidate-detail-sheet.tsx` renderiza a descrição logo abaixo do campo booleano
   existente, só quando `detail.application.specialNeeds` for `true`; se
   `specialNeedsDescription` vier `null` (candidato legado), mostra um texto indicando "não
   informado" em vez de quebrar ou ficar em branco (FR-007).
