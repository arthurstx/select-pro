# Phase 0 Research: Filtro por Curso nas Listagens de Candidatos

Não há `NEEDS CLARIFICATION` pendente no Technical Context do `plan.md` — o
projeto já fixa a stack (constitution.md, "Restrições Tecnológicas") e a spec
já resolveu as duas decisões de maior impacto (quais telas; singular vs.
múltipla seleção) como Assumptions. As decisões abaixo são de desenho, não de
tecnologia, e ficam registradas para não serem re-discutidas no `tasks.md`.

## Decisão 1 — Nome do parâmetro de query

**Decision**: `course` (singular), aceitando exatamente um valor do enum de
`CourseSchema`, ou ausente para "todos os cursos".

**Rationale**: A spec já assume seleção única (FR-006). `course` (não
`courses`) comunica isso no próprio nome — evita a ambiguidade de um nome no
plural que aceitasse só um valor. É consistente com o padrão já usado no
projeto para filtros de valor único (`status`, `sort`, `mode`), todos
singulares mesmo sendo enums.

**Alternatives considered**:
- `courses` (mesmo aceitando um só valor): rejeitado — nome no plural sugere
  suporte a múltipla seleção que não existe, e um consumidor da API poderia
  tentar `courses=a,b` e receber 400 sem entender por quê.
- `courses[]` com suporte a múltiplos valores: rejeitado por escopo (ver
  Assumption da spec) — nenhum caso de uso hoje pede isso, e adicionar suporte
  a múltiplos exigiria decisão de como combinar com os outros filtros
  (provavelmente OR entre cursos, E com os demais) sem um requisito real que
  justifique a complexidade agora. Caminho de evolução futura: o nome
  `course` continua válido lendo o primeiro valor, ou migra para `courses`
  como novo parâmetro aditivo — não é um beco sem saída.

## Decisão 2 — Reuso de `CourseSchema` como validador do query param

**Decision**: `course: CourseSchema.optional()` nos dois schemas de query
(`ListCandidatesQuerySchema`, `DashboardCandidatesQuerySchema`), sem novo
enum nem novo tipo.

**Rationale**: Constitution, Princípio I — contrato único em `shared`.
`CourseSchema` já é o único validador de curso no sistema (nem o banco tem
`CHECK`); reusá-lo aqui é a aplicação direta da regra, e automaticamente
mantém os dois filtros (check-in e dashboard) sincronizados com qualquer
mudança futura na lista de cursos.

**Alternatives considered**: Criar um `CourseFilterSchema` decorado (ex.: com
um valor `"todos"` explícito, no estilo de `CheckinStatusFilterSchema`).
Rejeitado — `CheckinStatusFilterSchema` precisa de um valor explícito porque
`"todos"` é um dos TRÊS estados possíveis e o filtro tem default
(`.default("todos")`). Curso não tem estado "todos" como valor de domínio:
"todos os cursos" é ausência do parâmetro, igual a como `process_id`/`from`/
`to` já funcionam no dashboard. Introduzir um sentinel token exigiria
tratamento especial no repositório sem ganho.

## Decisão 3 — Componente de filtro: chips vs. combobox/select

**Decision**: Um componente único, `CourseFilter`, compartilhado pelas duas
telas. Renderiza como grupo de chips (mesmo padrão visual/de acessibilidade
de `FiltersBar` no check-in — `role="group"`, `aria-pressed`) quando há
poucos cursos moda, mas como a lista de cursos tem 8 valores fixos (ver
`CourseSchema`), optar por um `<select>`/combobox nativo (com um item "Todos
os cursos") é o desenho recomendado, não chips soltos: 8 chips ocupariam mais
espaço horizontal do que os 3 chips de status hoje, forçando scroll horizontal
já no desktop, o que a spec explicitamente evita (SC-001, "em menos de 2
cliques/toques").

**Rationale**: O mesmo componente `filters-bar.tsx` já mistura um `<Input>`
de busca com um grupo de chips — adicionar um terceiro controle no mesmo
estilo visual de "pill"/botão (usando os componentes shadcn já presentes em
`front/components/ui/`, ex. `Select`) mantém a mesma linguagem visual sem
repetir o padrão de chips numa cardinalidade para a qual ele não foi pensado.

**Alternatives considered**: Chips com scroll horizontal (como `STATUS_TABS`
em `solicitacoes/page.tsx`, que usa `overflow-x-auto`). Rejeitado para este
caso: curso é usado para focar em UM valor específico dentre 8, o que é
exatamente o caso de uso de um seletor de lista (menor custo de leitura,
sem exigir rolagem para achar a opção certa), enquanto os grupos de chips
existentes no projeto sempre têm 2-3 opções.

## Decisão 4 — Onde o componente mora

**Decision**: `front/components/painel/course-filter.tsx`, ao lado dos
demais componentes de `/painel` compartilhados entre rotas.

**Rationale**: Nem `check-in/_components/` nem um futuro `_components/` do
dashboard fariam sentido — o componente é consumido por ambos. `front/
components/painel/` já existe e já contém componentes cross-rota do mesmo
namespace de URL (`painel-nav.tsx`, `painel-sidebar.tsx`).

## Impacto em cache (KV)

- `CheckinListCache` (`api/src/lib/checkin-list-cache.ts`): `CachedListParams`
  ganha `course?: Course`, entrando na chave via `keyFor` (mesmo tratamento
  hoje dado a `search`/`status`). TTL de 60s e invalidação por geração
  continuam sem mudança — curso não é alterado por check-in/desmarcar
  presença, então não precisa disparar `invalidate()`.
- `DashboardCache`: sem mudança de classe — é genérico. `DashboardService.
  listCandidates` passa a incluir `query.course ?? ""` no array de
  `keyFor("candidates", role, [...])`, mesmo padrão já usado para `search`,
  `from`, `to`, `sort`.
