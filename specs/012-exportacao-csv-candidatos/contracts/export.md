# Contrato: `GET /exports/candidates`

Admin-only (`[requireAuth, requireRole(ROLES.ADMIN)]`, mesmo padrão de `rooms.routes.ts`).

## Query params (`ExportCandidatesQuerySchema`)

| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `process_id` | uuid \| `"all"` | edição corrente | mesmo vocabulário do dashboard |
| `search` | string | — | busca por nome, `LIKE` case-insensitive |
| `from` | `AAAA-MM-DD` | — | inclusive |
| `to` | `AAAA-MM-DD` | — | inclusive até o fim do dia |
| `include_sensitive` | `"true"` \| `"false"` | `"false"` | inclui gênero/etnia quando `"true"` |

## Resposta de sucesso — `200`

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="candidatos-<edicao-ou-todas>-<AAAAMMDD-HHmmss>.csv"
```

Corpo: CSV com `\r\n` como terminador de linha (RFC 4180), primeira linha = cabeçalho.

**Colunas sempre presentes** (`EXPORT_CSV_COLUMNS`, nesta ordem): `id`, `nome`, `email`,
`telefone`, `curso`, `semestre`, `edicao`, `data_inscricao`, `origem_divulgacao`,
`origem_divulgacao_outro`, `restricao_sabado`, `necessidades_especiais`.

**Colunas adicionais quando `include_sensitive=true`** (`EXPORT_SENSITIVE_CSV_COLUMNS`,
acrescentadas ao final): `genero`, `etnia`. Quando `include_sensitive=false` (ou ausente),
essas duas colunas **não existem no arquivo** — não aparecem vazias, não aparecem com `N/A`.

Valores: `curso`/`origem_divulgacao`/`genero`/`etnia` saem traduzidos pelos mapas de
`candidate.schema.ts` (`COURSE_LABELS` etc.), não o slug cru — é o que um humano abrindo a
planilha espera ler. `restricao_sabado`/`necessidades_especiais` saem como `"sim"`/`"não"`, não
`1`/`0` — mesma razão. `data_inscricao` sai como `AAAA-MM-DD HH:MM:SS` (o que o D1 grava em
`created_at`, sem timezone shift).

## Efeito colateral obrigatório

Toda resposta `200` grava uma linha em `candidate_export_events` (ver `data-model.md`) ANTES
do corpo ser devolvido — `actor_id` do JWT, `process_id`/`process_label` do recorte resolvido,
`included_sensitive_fields` do que foi de fato incluído, `row_count` do que foi de fato
escrito. Se o INSERT falhar, a rota responde `500 INTERNAL_ERROR` e nenhum CSV é devolvido
(FR-009) — falha técnica, não erro de domínio, então não é modelada como `Either`.

## Erros

| Status | Código | Quando |
|---|---|---|
| `401` | `INVALID_ACCESS_TOKEN` / `ACCESS_TOKEN_EXPIRED` | sem sessão válida |
| `403` | `INSUFFICIENT_ROLE` | autenticado, mas não é admin |
| `404` | `SELECTION_PROCESS_NOT_FOUND` | `process_id` não corresponde a nenhuma edição |
| `400` | `VALIDATION_ERROR` | query inválida (datas malformadas, intervalo invertido) |
| `500` | `INTERNAL_ERROR` | falha ao gravar o registro de auditoria (FR-009) |

Nenhum caso de sucesso desta rota tem corpo JSON — é a primeira rota do projeto cuja resposta
de sucesso não é `{ data: ... }`.
