# Research: Navegação por modalidade + check-in dividido

## Decisão 1: `attendance` como filtro opcional em `ListCandidatesQuerySchema`, reaproveitando `AttendanceSchema`

**Decision**: `ListCandidatesQuerySchema` (`shared/src/schemas/checkin.schema.ts`) ganha
`attendance: AttendanceSchema.optional()`. `CheckinRepository.listCandidates` aplica
`COALESCE(a.saturday_restriction, 0) = ?` (1 = online, 0 = presencial) como mais uma condição
em `baseConditions`, no mesmo padrão já usado pra `course`.

**Rationale**: `AttendanceSchema` (`"online" | "presencial"`) já existe e já é a fonte de
verdade de modalidade em todo o projeto (FEAT-0010/0012/0018) — reaproveitar em vez de
recriar. Entrar em `baseConditions` (não só em `conditions`) garante que `totalCandidates` e
`attendance` (o resumo "X de Y" do cabeçalho) também respeitem o filtro — senão o contador da
tela presencial contaria candidatos online também.

**Alternatives considered**: Duas rotas HTTP diferentes (`/candidates/presencial`,
`/candidates/online`) — rejeitado, duplicaria toda a lógica de busca/paginação/cache por
nada; um filtro a mais no mesmo endpoint já resolve, mesmo padrão do `course` (FEAT-0015).

## Decisão 2: `attendance` entra na chave do cache do KV

**Decision**: `CachedListParams` (`api/src/lib/checkin-list-cache.ts`) ganha `attendance?:
Attendance`, e `keyFor` inclui esse valor na string da chave.

**Rationale**: Sem isso, a tela presencial e a online cacheariam sob a MESMA chave (mesma
página/busca/status/curso, só mudando `attendance`) — a segunda a pedir receberia do cache o
resultado da primeira, misturando modalidades. É a armadilha mais fácil de passar batido
nesta feature.

**Alternatives considered**: Nenhuma — é a única forma correta de diferenciar o cache por essa
dimensão nova.

## Decisão 3: Front — duas rotas finas reaproveitando `CandidateList`/`FiltersBar`, sem duplicar lógica

**Decision**: `/painel/check-in/presencial` e `/painel/check-in/online` são páginas finas que
renderizam um componente compartilhado (`CheckInScreen({ attendance })`, extraído do atual
`page.tsx`), passando `attendance` fixo para `useCandidatesQuery`. O seletor de modalidade não
existe nessas telas — a própria rota já decide.

**Rationale**: Mesmo racional da FEAT-0018 (`GroupsView` compartilhado entre
`/painel/grupos/online`/`presencial`) — evita duplicar paginação/busca/status/curso em dois
arquivos que divergiriam com o tempo.

**Alternatives considered**: Um seletor de modalidade dentro de uma tela só — rejeitado, o
usuário pediu explicitamente duas telas/rotas de verdade, para caberem nos dois grupos de nav
separados (FR-006).

## Decisão 4: `/painel/check-in` vira redirect para `/painel/check-in/presencial`

**Decision**: Mesmo padrão já usado em `/painel/grupos` (FEAT-0018) — `redirect()` do Next.js,
sem lógica própria.

**Rationale**: FR-005 — link antigo não pode quebrar. Presencial como destino padrão por ser o
volume maior/fluxo mais comum (mesma escolha já feita pra `/painel/grupos` → online, aqui
espelhada para o lado presencial por ser esta a modalidade "padrão" histórica do produto).

**Alternatives considered**: Redirecionar para online (por simetria com `/painel/grupos`) —
sem preferência forte; presencial escolhido por ser o fluxo original do produto antes de
existir modalidade online.

## Decisão 5: Nav — "Grupos" (dropdown) e "Check-in" (item solto) saem do topo, viram filhos de "Presencial"/"Online"

**Decision**: `PAINEL_NAV_ITEMS` perde o grupo "Grupos" (criado na FEAT-0018) e o item solto
"Check-in"; ganha dois `PainelNavGroup` novos, "Presencial" (`Grupos Presenciais` + `Check-in
Presencial`) e "Online" (`Grupos Online` + `Check-in Online`). O tipo `PainelNavGroup` já
existe (FEAT-0018) — reaproveitado sem mudança de shape.

**Rationale**: `PainelSidebar`/`PainelMobileNav` já sabem renderizar `PainelNavGroup`
(`isPainelNavGroup`) — é troca de dados, não de componente.

**Alternatives considered**: Três grupos (manter "Grupos" e criar "Check-in" como grupos
próprios, cada um com os dois filhos online/presencial invertidos) — rejeitado, é
exatamente o oposto do que o usuário pediu (agrupar por modalidade, não por tipo de tela).
