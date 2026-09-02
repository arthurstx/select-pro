# Data Model: Correção de processos seletivos

Nenhuma tabela nova, nenhuma coluna nova. Esta feature adiciona um caminho de **escrita**
sobre uma entidade que já existe.

## Entidade: Processo seletivo (`selection_processes`)

Definida na migration `0006-candidate-checkin.sql`. Sem mudança de schema físico nesta
feature.

| Campo        | Tipo   | Regras                                          | Editável por esta feature |
|--------------|--------|--------------------------------------------------|----------------------------|
| `id`         | TEXT (UUID) | Primary key. Nunca muda — é o vínculo estável com candidatos/check-ins/grupos/avaliações. | Não |
| `label`      | TEXT   | `NOT NULL UNIQUE`. Ex.: `"2026.2"`.              | Sim (FR-002, FR-004) |
| `starts_at`  | TEXT (data ISO) | `NOT NULL`. Deve ser anterior a `ends_at` (FR-003). | Sim (FR-002) |
| `ends_at`    | TEXT (data ISO) | `NOT NULL`. Deve ser posterior a `starts_at` (FR-003). | Sim (FR-002) |
| `created_at` | TEXT   | `DEFAULT CURRENT_TIMESTAMP`, imutável.           | Não |

**Sem state transitions**: não existe conceito de "processo ativo/arquivado" (fora de escopo
— ver Assumptions do `spec.md`). Um processo seletivo não passa por estados; ele só tem seus
metadados de calendário corrigidos.

**Sem cascata**: `id` é a única coluna que outras tabelas referenciam
(`candidates.process_id`, `candidate_checkins.process_id`, `groups.process_id`,
`evaluations` via grupo, etc. — todas por FK em `id`). Editar `label`/`starts_at`/`ends_at`
não requer nenhuma atualização em cascata (FR-008) porque nenhuma FK aponta para esses
campos.

## Validation Rules (resumo, ver `spec.md` para o texto completo)

- `label`: obrigatório, não pode colidir com o `label` de outro processo seletivo
  (FR-004 — a constraint `UNIQUE` do banco já impede a gravação; o service confere antes,
  ver `research.md` Decisão 4, e traduz a violação em erro de negócio).
- `starts_at` / `ends_at`: ambos obrigatórios; `starts_at` deve ser estritamente anterior a
  `ends_at` (FR-003 — validado no schema Zod compartilhado, ver `research.md` Decisão 3).
- `id`: deve corresponder a um processo seletivo existente (FR-005).
