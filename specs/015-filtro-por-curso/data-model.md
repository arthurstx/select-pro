# Data Model: Filtro por Curso nas Listagens de Candidatos

Nenhuma entidade nova, nenhuma migration. Esta feature apenas expõe um
caminho de filtro sobre um atributo já existente (`candidates.course`).
Os "objetos" abaixo são os contratos de request/response afetados —
já existentes, apenas estendidos.

## Course (inalterado)

Fonte: `shared/src/schemas/candidate.schema.ts`.

```ts
export const CourseSchema = z.enum([
  "eng-computacao",
  "eng-civil",
  "eng-mecanica",
  "eng-quimica",
  "eng-producao",
  "eng-automacao",
  "eng-eletrica",
  "arquitetura",
]);
export type Course = z.infer<typeof CourseSchema>;
```

Nenhuma mudança. Reutilizado como está nos dois novos campos de query abaixo.

## ListCandidatesQuery (estendido) — `GET /candidates` (check-in)

Fonte: `shared/src/schemas/checkin.schema.ts`.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `page`, `per_page` | herdados de `PaginationQuerySchema` | não | inalterado |
| `search` | `string` | não | inalterado |
| `status` | `CheckinStatusFilterSchema` | não (default `"todos"`) | inalterado |
| **`course`** | **`CourseSchema`** | **não** | **NOVO — ausente = todos os cursos** |

Validação: `course` fora do enum → `400 VALIDATION_ERROR` (mesmo `validationHook` já usado pela rota, nenhuma mudança de código de erro).

## DashboardCandidatesQuery (estendido) — `GET /dashboard/candidates`

Fonte: `shared/src/schemas/dashboard.schema.ts`.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `page`, `per_page` | herdados | não | inalterado |
| `process_id` | `ProcessScopeSchema` | não | inalterado |
| `search` | `string` | não | inalterado |
| `from`, `to` | `DateOnlySchema` | não | inalterado |
| `sort` | `DashboardCandidatesSortSchema` | não (default `"recent"`) | inalterado |
| **`course`** | **`CourseSchema`** | **não** | **NOVO — ausente = todos os cursos; não afeta `GET /dashboard/metrics`** |

Validação: mesma regra — `course` inválido é rejeitado pelo Zod antes de chegar ao `superRefine` de intervalo de data (ordem não importa, ambos são validações independentes de campo).

## Repositórios (parâmetros internos, não expostos como contrato)

### `ListCandidatesParams` (check-in) — `api/src/repositories/checkin.repository.ts`

Ganha `course?: Course`. Quando presente, adiciona `AND c.course = ?` às
`conditions`/`bindings` já existentes (mesmo padrão de `search`/`status`).

### `ListCandidatesFilters` (dashboard) — `api/src/repositories/dashboard.repository.ts`

Ganha `course?: Course`. Mesma adição de condição, ao lado de
`processId`/`search`/`from`/`to`.

### `CachedListParams` (cache do check-in) — `api/src/lib/checkin-list-cache.ts`

Ganha `course?: Course`, incluído na chave de cache (`keyFor`) — sem isso, o
KV serviria a mesma lista cacheada para cursos diferentes.

## Sem mudanças de schema de banco

- `candidates.course` já existe, `TEXT`, sem `CHECK` — validado apenas pelo
  Zod (`CourseSchema`), conforme já documentado no contexto da feature.
- Nenhuma migration `.sql` nova.
