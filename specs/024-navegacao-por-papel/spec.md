# Feature Specification: Navegação por papel + estados claros em Minhas Avaliações

**Feature Branch**: `develop`

**Created**: 2026-09-05

**Status**: Implementada

**Input**: Pedido do usuário em 2026-09-05 — "mesmo o avaliador não tendo permissão de acessar determinadas telas, como criação de sala, todas as avaliações, entre outras coisas, ainda aparece na sidebar para eles esses itens (…) se eles não têm permissão de acessar, nem na tela para eles clicarem deveria aparecer" + "trate melhor a validação de 'minhas avaliações' no front-end: caso um avaliador não tenha grupo, deixe bem claro que não aparece nada porque ele ainda não tem um grupo, e não que foi erro genérico".

Tarefa transversal de autorização na UI, não uma feature de produto — não passou pelo ciclo completo de SDD. Esta nota existe para auditoria: registra a matriz de papéis, a doutrina de fail-open e um bug pré-existente descoberto no caminho. **Nenhum contrato em `shared/` e nenhuma rota da API mudaram.**

## Problema

1. `PAINEL_NAV_ITEMS` era renderizado sem filtro. Um `avaliador` via Salas, Avaliadores, Check-in de Membros, Solicitações, Processos, Avaliações e Grupos — todas `ADMIN_ONLY` na API — e tomava 403 ao clicar. O `admin` via "Minhas Avaliações", que é `AVALIADOR_ONLY`. A decisão anterior (comentário em `painel-nav.tsx`: "guard real é a API, não o menu") foi revertida: se não pode acessar, não aparece.
2. "Minhas Avaliações" caía no estado de erro genérico ("Não foi possível carregar seu grupo. / Verifique sua conexão e tente novamente.") em casos cujo motivo a API já informava — notadamente o `403 INSUFFICIENT_ROLE` do admin abrindo a tela pelo menu, que não tinha branch. Além disso, grupo existente com zero candidatos alocados renderizava **tela em branco**, sem mensagem nenhuma.

## Matriz de papéis por rota

Espelha os `requireRole` de `api/src/routes/*`. Fonte única em `front/lib/auth/route-roles.ts`, consumida pelo filtro da sidebar e pelo guard de rota.

| Rota | Papéis |
|---|---|
| `/painel` (dashboard) | admin + avaliador |
| `/painel/check-in/presencial`, `/painel/check-in/online` | admin + avaliador |
| `/painel/minhas-avaliacoes` | avaliador |
| `/painel/avaliacoes` | admin |
| `/painel/avaliadores` | admin |
| `/painel/check-in-membros` | admin |
| `/painel/grupos/presencial`, `/painel/grupos/online` | admin |
| `/painel/processos` | admin |
| `/painel/salas` | admin |
| `/painel/solicitacoes` | admin |

Casamento por **prefixo mais longo**, ordenado por comprimento no módulo — sem isso `/painel/check-in` engoliria `/painel/check-in-membros`.

## Decisões

- **D1 — Esconder, não desabilitar.** Item sem permissão some da sidebar. Item cinza com cadeado só adia a mesma frustração.
- **D2 — Grupo com um filho vira link de topo.** Para o avaliador, "Presencial" e "Online" ficam com um filho cada; acordeão de um item é ruído. Consequência aceita: a nav do avaliador tem forma diferente da do admin.
- **D3 — Fail-open para rota não listada.** Uma `/painel/*` nova esquecida na tabela libera os dois papéis e o usuário toma o 403 da API — mesmo comportamento de hoje. O contrário (tela inacessível por esquecimento) é pior, e a barreira real continua sendo o `requireRole`. Mesma doutrina já documentada em `auth-guard.tsx`.
- **D4 — Guard no layout, não por página.** `RouteRoleGuard` envolve `{children}` dentro do `<main>` em `app/painel/layout.tsx`. Como ele devolve a tela de negado *em vez de* renderizar a página, a função da página nunca executa e nenhum `useQuery` dela sai para tomar 403. Envolve só o miolo (não a casca) para quem foi negado ainda ter sidebar e conseguir sair. O guard inline de `solicitacoes/page.tsx` foi removido — substituído, não empilhado.
- **D5 — `AuthUserSchema.role` continua `z.string()`.** Apertar para `z.enum` faria um papel novo no backend quebrar o parse do login inteiro em vez de degradar. O estreitamento acontece no consumo, via `asRole()`, que devolve `null` para papel desconhecido (= sem acesso a nada).
- **D6 — Copy de "sem permissão" é uma const só.** `ACCESS_DENIED` em `app/painel/_lib/error-view.ts`, usada tanto pelo `RouteRoleGuard` quanto pela branch `INSUFFICIENT_ROLE` do `terminalErrorFor`. São o mesmo fato para o usuário.

## Estados de Minhas Avaliações

| Situação | O que a tela mostra |
|---|---|
| Carregando | 4 skeletons (inalterado) |
| Sem grupo (`409 NOT_IN_ANY_GROUP`) | "Você ainda não foi alocado a um grupo." + explicação + botão **Atualizar** (antes não tinha ação: o avaliador ficava preso mesmo depois de o admin organizar os grupos) |
| Grupo sem candidatos (200, lista vazia) | "Nenhum candidato no seu grupo ainda." + botão Atualizar — **antes era tela em branco** |
| Sem processo corrente / manutenção / papel errado | Delegado ao `terminalErrorFor` já existente |
| Qualquer outro erro | Título genérico, mas a **descrição passa a ser a mensagem que a API mandou**, não um chute sobre conexão |

## Arquivos

- `front/lib/auth/route-roles.ts` (novo) — `asRole`, `rolesForRoute`, `canAccessRoute`, `filterNavForRole`
- `front/lib/auth/route-roles.test.ts` (novo) — 9 casos, `node --test`
- `front/app/painel/_components/role-guard.tsx` (novo) — `RouteRoleGuard`, `AccessDeniedScreen`
- `front/app/painel/layout.tsx`, `front/components/painel/painel-nav{,-content}.tsx`, `front/app/painel/_lib/error-view.ts`, `front/app/painel/solicitacoes/page.tsx`, `front/app/painel/minhas-avaliacoes/page.tsx`
- `front/app/painel/dashboard-screen.tsx` — botão "Exportar CSV" escondido do avaliador. O dashboard é das duas funções, mas `GET /exports` é `ADMIN_ONLY`; era o mesmo defeito da sidebar, só que dentro de uma tela permitida.

Nota de implementação: `route-roles.ts` usa literais `"admin"`/`"avaliador"` com `satisfies Role` em vez de importar `ROLES` em runtime. Motivo: o barrel `shared/src/index.ts` usa imports sem extensão e não carrega sob `node --test`, e este módulo tem testes de unidade. O `satisfies` preserva a garantia de tipo contra `shared`. **Não é padrão para código sem teste** — lá continua sendo `ROLES`.

## Backlog descoberto

`GroupCard` tem botões de entrar/sair de grupo online para o avaliador (FEAT-0018, US2), mas `GET /groups` — a listagem que a tela precisa para renderizar qualquer grupo — é `ADMIN_ONLY` em `api/src/routes/group.routes.ts`. O self-service online é, portanto, **inalcançável pela UI hoje**, e por isso `/painel/grupos/online` entrou na tabela como admin-only. Consertar exige liberar a listagem para `avaliador` (mantendo organizar/mover/limpar admin-only) — mudança de backend, fora do escopo desta tarefa.
