# Contrato: `POST /groups/preview/online`

Espelha `POST /groups/preview/presencial` (FEAT-0021) — calcula, sem persistir nada, como os
candidatos online presentes seriam divididos em grupos.

## Request

Sem corpo (mesmo padrão de `POST /groups/organize/online`, que também não recebe parâmetros —
o algoritmo online não tem seleção de participante como o presencial tem, FR-015).

## Response `200`

```ts
export const PreviewOnlineResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema),
    }),
});
```

- `groups[].id`: gerado na hora (`crypto.randomUUID()`), nunca existiu no banco — só serve de
  `key` de lista no front, igual ao preview presencial.
- `groups[].evaluators`: sempre `[]` — o cálculo automático do online nunca atribui avaliador
  (FR-015); atribuição continua exclusivamente manual, depois que a organização real existir.
- `groups[].room`: sempre `null` — online nunca teve sala.
- Sem `unallocatedCandidateCount`: o algoritmo online sempre aloca todos os candidatos
  presentes (não há noção de capacidade de sala no online).

## Erros

Mesmos códigos de `POST /groups/organize/online`: `NO_ACTIVE_SELECTION_PROCESS` (404),
`NO_CANDIDATES_PRESENT` (409) — reaproveita os mesmos error classes de
`OrganizeOnlineError`.

## Camada de serviço

`GroupService.previewOnline(now?)` — mesmo formato de `previewPresencial`, mas mais simples
(sem `evaluatorUserIds`, sem `availableEvaluators` na resposta): busca candidatos online
presentes, roda `organizeOnlineGroups(candidates)` (assinatura nova, sem `rooms` — ver
`research.md` D7), monta `GroupSummary[]` em memória (sem tocar o banco) e retorna. NUNCA chama
`replaceOrganization`.

## Aprovação

Reaproveita `POST /groups/organize/online` já existente, sem mudança de assinatura — ver
`research.md` D9. O front chama esse endpoint no clique de "Aprovar simulação e organizar
grupos" do novo modal, exatamente como a aprovação presencial já reaproveita
`POST /groups/organize/presencial`.
