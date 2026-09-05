# Contexto Operacional (para qualquer agente)

Este arquivo guarda contexto operacional/de estado que não vive no código nem nas specs, para que qualquer agente (Claude Code local, Claude Code na web, outro contribuidor humano) parta do mesmo entendimento ao assumir este projeto. Ele complementa, mas não substitui, `AGENTS.md` (convenções) e `specs/` (contratos de feature).

## Fluxo multi-dispositivo / multi-agente

- Sessões de terminal (CLI) do Claude Code rodam **localmente** na máquina onde foram abertas e não sincronizam entre dispositivos (ex: celular) nem entre si — cada sessão tem seu próprio histórico e memória.
- O ponto de sincronização entre agentes/dispositivos é o **GitHub** (`origin`: `github.com/arthurstx/select-pro`). Qualquer contexto que precise sobreviver entre sessões/dispositivos deve estar commitado e enviado (`git push`).
- Uma sessão do Claude Code na web (claude.ai/code) parte do zero: não tem acesso à memória local nem ao histórico de conversa de sessões de terminal. Ela só enxerga o que está no repositório remoto.

### Sessões em paralelo: sempre via worktree, sempre no terminal

Quando mais de uma sessão for trabalhar ao mesmo tempo, cada uma roda no **seu próprio git worktree**, e cada worktree abre numa **janela própria do kitty** — o objetivo é enxergar os processos de cada sessão lado a lado, em janelas separadas:

```bash
kitty --detach --hold --title "wt: <nome>" --directory (git rev-parse --show-toplevel) claude --worktree <nome>
```

- `claude --worktree <nome>` (ou `-w`) cria o git worktree e abre a sessão já dentro dele.
- `--detach` solta a janela nova do terminal que a invocou, devolvendo o prompt de origem.
- `--hold` mantém a janela aberta num shell depois que o Claude sai, em vez de ela sumir levando o output junto.
- `--directory` com a raiz do repo garante que o worktree nasça do repositório certo, mesmo que o comando seja disparado de dentro de outro worktree.

`git worktree list` mostra todos os worktrees ativos e em que branch cada um está. O worktree nasce em `.claude/worktrees/<nome>/`, **dentro do próprio repo**, numa branch `worktree-<nome>` e com lock. Por isso `.claude/worktrees/` está no `.gitignore`: são checkouts inteiros, e sem essa linha um `git add .` varreria um worktree completo para dentro do repositório.

Para remover quando a feature acabar, **feche a janela primeiro** e então:

```bash
git worktree unlock .claude/worktrees/<nome>
git worktree remove .claude/worktrees/<nome>
git branch -D worktree-<nome>
```

O `unlock` é obrigatório: o lock é posto pela **sessão do Claude** (`lock reason: claude session <nome> (pid ...)`), e um `git worktree remove --force` simples **não** o vence — o git pede `remove -f -f`. Prefira o `unlock` explícito ao `-f -f`: se o lock não for stale, você quer descobrir isso em vez de atropelar uma sessão viva. Confira com `ps -p <pid>` antes.

> O kitty herda `$SHELL` de quem o dispara. Rodando do seu fish, a janela abre em fish; disparado por um processo cujo `$SHELL` é bash (uma sessão do próprio Claude, por exemplo), ela abre em bash. Para tornar isso independente de quem dispara, fixe `shell /usr/bin/fish` em `~/.config/kitty/kitty.conf`.

> **Sempre pelo terminal, nunca por dentro da sessão.** Um agente não deve criar worktree a partir de uma sessão já aberta (via ferramenta de isolamento ou subagente): worktree criado por dentro não abre janela, não aparece no terminal, e o fluxo dos processos deixa de ser visível. Quem abre worktree é o humano, no kitty.

Quatro armadilhas deste monorepo, todas já verificadas:

- **`npm install` por worktree.** `node_modules` não é compartilhado entre checkouts (~441 MB na raiz). Sem instalar, o worktree não roda.
- **`node_modules/shared` é symlink relativo** (`-> ../shared`), então cada worktree resolve o `shared/` **do próprio checkout**. Consequência: um contrato só existe para os outros worktrees depois de **commitado** — escrever o schema não basta.
- **`api/.dev.vars` não é commitado** (`api/.gitignore:35`). Um worktree novo nasce sem ele, e aí some o `MEMBER_DIRECTORY_BYPASS=true` — o cadastro local passa a bater no Supabase real. Copie o arquivo ao criar o worktree.
- **`.specify/feature.json` é per-checkout e gitignored.** O worktree não herda qual feature do Spec Kit está ativa: rode `export SPECIFY_FEATURE=<dir-da-feature>` nele.

Duas coisas que **nunca** vão em paralelo:

- **`shared/src/schemas/`** — dois agentes editando contrato é conflito garantido, e é exatamente o que a Regra de Ouro dos Contratos existe para evitar. Contrato é fase sequencial: um agente escreve, commita, e só então os outros bifurcam.
- **Migrations.** Dois worktrees criam o mesmo número de migration sem enxergar um ao outro. Features que tocam o banco vão uma de cada vez.

## Branches

- `master`: produção.
- `develop`: branch de integração ativa.
- Branches de feature nascem de `develop`. Já mergeadas: `feat/wizard-inscricao-6-etapas` e `feat/remover-otc-inscricao-passo-unico`. `feat/auth-membro` ainda existe local e em `origin`, mas a FEAT-0003 já está em `develop` — a branch não aparece em `git branch --merged develop`, então confira antes de assumir que pode apagá-la.

> ⚠️ Antes de assumir que `develop` e `master` estão sincronizados, rode `git log master..develop` e `git log develop..master` — historicamente já divergiram nas duas direções (features prontas em `develop` aguardando promoção, e commits de deploy direto em `master`).

## Ambientes / Infra (Cloudflare Worker `api/`)

- `api/wrangler.jsonc` define os bindings por ambiente (D1, vars). Ao alterar `database_name`/`database_id`, confirme qual ambiente (staging vs produção) está sendo afetado antes de commitar — esses valores têm mudado localmente sem commit correspondente em algumas sessões.
- **O Worker roda no plano Free da Cloudflare.** O limite que importa é **10 ms de CPU por invocação** — tempo de I/O (fetch, D1, KV) não conta. Na prática quase nada esbarra nisso, exceto criptografia: o hash de senha do FEAT-0003 é o primeiro código do projeto que precisa ser calibrado para caber. Estourar o limite não é falha sob carga, é `Error 1102` determinístico, e `wrangler dev` **não** aplica o teto — só dá para medir em produção. Consequências no mesmo plano: **Cloudflare Queues indisponível** (exige plano pago) e apenas **uma** regra de Rate Limiting no WAF.
- **O Resend já voltou, na FEAT-0003.** `api/src/lib/mailer.ts` define a interface `Mailer` e a implementação `ResendMailer`, que bate **direto no endpoint HTTP** (`https://api.resend.com/emails`) em vez de usar o SDK `resend` — de propósito, para não pagar bundle size no cold start. Por isso `resend` **não** aparece no `package.json`. O uso hoje é só `/auth/forgot-password`, fora do caminho crítico (`waitUntil`). Qualquer feature nova que precise enviar e-mail (ex.: a aprovação de cadastro da 008) **reusa essa interface**, não cria outra. `RESEND_API_KEY` já está no `api/.dev.vars`; nos Workers, **conferir com `wrangler secret list` antes de recriar.**
- **Secrets e vars que o FEAT-0003 exige e ainda não existem:** secrets `JWT_SECRET` e `SUPABASE_SERVICE_ROLE_KEY`; vars `SUPABASE_URL` e `FRONT_ORIGIN` (origin explícita do front — o `cors()` atual reflete qualquer origin, o que é correto para `/candidate/*` e inaceitável em `/auth/*`, que trafega cookie). A `service_role` ignora RLS e dá acesso total ao banco da tec: nunca em `wrangler.jsonc`.
- **KV `PENDING_REGISTRATIONS`:** não é mais referenciado no `wrangler.jsonc`. Os namespaces seguem existindo na conta Cloudflare (ids `c7ac7d5d…` produção e `0a7885b8…` staging) e podem ser deletados manualmente.
- **Migrations do D1** precisam ser aplicadas por ambiente (`wrangler d1 migrations apply <DB> --env staging --remote`). A `0009-rooms-unique-name.sql` é a mais recente — **aplicada só localmente** (feita a partir do merge de `feat/status-membro-aprovacao` e `feat/cadastro-de-salas`, staging/produção ainda pendentes). ⚠️ **Aplicar a migration não é opcional nem silencioso:** com o Worker novo no ar e o banco sem as tabelas, `GET /candidates` responde `409 NO_ACTIVE_SELECTION_PROCESS` — o erro parece de configuração de processo seletivo, mas a causa é a migration que faltou.
- **KV `CANDIDATES_KV`** (`51d028fb…` produção, `b904715d…` staging): cache da listagem do check-in. TTL de 60s — que é o **mínimo** que o KV aceita em `expirationTtl`; valores menores fazem `kv.put` falhar. A invalidação real é por geração (um contador por processo, incrementado a cada marcar/desmarcar), então o TTL só limita o pior caso.
- **`MEMBER_DIRECTORY_BYPASS=true` em `api/.dev.vars`** pula a checagem de membro na Supabase no cadastro local, porque `wrangler dev` usa o bloco **raiz** do `wrangler.jsonc` (não existe env "development") e o `SUPABASE_URL` de lá aponta para um projeto real. O wrangler nunca aplica `.dev.vars` a `deploy`, então staging/produção continuam exigindo membro real sem depender de nenhuma mudança de código. Os testes fixam `MEMBER_DIRECTORY_BYPASS: "false"` no `testEnv()` — o `vitest-pool-workers` também lê `.dev.vars`, e a suíte não pode depender de como cada um configurou o próprio ambiente.
- **Existe CD por push, e ele sobrescreve deploy manual.** `master` → produção e `develop` → staging, tanto na Cloudflare (Worker) quanto na Vercel (front). Consequência prática: um `wrangler deploy --var ...` feito à mão é substituído pelo deploy do CD se houver um push logo em seguida — foi o que aconteceu na 0004, com o CD revertendo `MAINTENANCE_MODE` para `"false"` 18s depois do deploy manual. **Faça o push antes**, e só então o deploy manual de manutenção.
- **Deploy da Cloudflare não propaga na hora.** Depois de um deploy, as duas versões convivem por algumas dezenas de segundos e as requisições alternam entre elas (na 0004 o 503 só apareceu ~40s depois, e ainda oscilou). Nunca presuma que o modo de manutenção está no ar: sonde o endpoint até obter várias respostas 503 seguidas antes de mexer no banco.
- **Modo de manutenção (`MAINTENANCE_MODE`):** var em `wrangler.jsonc` que, quando `"true"`, faz `/candidate/*` responder 503 sem gravar nada. Existe para fechar a janela de escrita em migrations que reconstroem tabelas: **deploy com `"true"` → migration → deploy com `"false"`**. Deve estar `"false"` em todo deploy normal — se inscrições estiverem retornando 503, confira essa var antes de investigar qualquer outra coisa.
- **Reconstruir tabela com filhos no D1 é operação de risco.** `candidates` tem três filhos, dois com `ON DELETE CASCADE`. Um `DROP TABLE candidates` apaga todas as inscrições, e nem `PRAGMA defer_foreign_keys` nem `legacy_alter_table` evitam isso (`PRAGMA foreign_keys = OFF` não existe no D1). Pior: o `foreign_key_check` posterior volta limpo, então a migration parece ter dado certo. O padrão que funciona está na `0004`: copiar os filhos para tabelas sem FK, dropar os filhos antes do pai, reconstruir e restaurar.

## Backlog conhecido (`task.md`)

`task.md` na raiz é a fonte única do backlog — inclusive o que sobrou fora do 008–016 (itens
órfãos, pendências operacionais). Resumo do que mudou de estado:

- [x] Inscrição do candidato na plataforma (FEAT-0001) — **implementada**: wizard de 6 etapas
  (commit `c267fd0`). Esta linha ficou marcada como pendente por engano depois da feature
  pronta; corrigida em 2026-08-24.
- [x] Inscrição dos avaliadores na plataforma (FEAT-0003) — **implementada** em backend e UI: 8 rotas em `api/src/routes/auth.routes.ts` (commit `c74781f`) e as telas em `front/app/(auth)/` (`login`, `cadastro`, `recuperar-senha`, `redefinir-senha`). A tela "Definir Nova Senha", antes listada como pendente, existe: `front/app/(auth)/redefinir-senha/`.
  - Pendências que **não são código** e não dá para verificar pelo repositório: calibrar as iterações do PBKDF2 medindo em produção (`wrangler dev` não aplica o teto de 10 ms de CPU) e criar a regra de Rate Limiting do WAF em `/auth/*` — lembrando que o plano Free dá **uma** regra só.

## FEAT-0006 — feita, com um item órfão

Dos três itens que a FEAT-0005 deixou para a spec seguinte, **dois foram implementados** na `0007-candidate-edition-uniqueness.sql`: unicidade de email/telefone por edição (`UNIQUE (process_id, email)` / `(process_id, phone)`, destravando a recandidatura entre semestres) e padronização do telefone para E.164.

- [ ] **Tela de logs do admin, alimentada por webhook.** O dado **já está sendo gravado** desde a FEAT-0005 (`checkin_events`, append-only, com ator/ação/horário). Falta a tela e o webhook.

> ⚠️ Este item **não entrou** no backlog 008–016 abaixo — ele não estava na lista de tarefas que originou aquelas specs. Está aqui para não sumir.

## Backlog de specs 008–016 (organizado em 2026-08-24)

Nove features derivadas de um backlog em texto livre sobre separação automática de grupos, avaliação de candidatos e papéis de host. Ordem por dependência:

```
011 (salas) ── ✅ feita ──────┐
008 (status) ── ✅ feita ──→ 009 (host) ── ✅ feita ──→ 010 (check-in) ✅ feita → 012 (grupos) ✅ feita → 013 (avaliação) ✅ feita

014 (necessidades especiais) ✅, 015 (filtro por curso) ✅, 016 (exportação CSV) ✅ — sem dependência
```

**As nove features do backlog 008–016 estão todas implementadas.** 008, 009, 010, 011, 014,
015 e 016 estão mescladas em `develop` (2026-08-26). **012 foi mesclada em `develop`
LOCALMENTE nesta sessão** (merge commit, sem `git push` — a pedido do usuário: "não precisa
subir nada no momento"); **013 está implementada na branch `claude/feat-0013-avaliacao-candidatos`
(em cima da 012), ainda não mesclada.** ⚠️ **`develop` local está à frente do
`origin/develop` remoto** — antes de qualquer outra sessão/dispositivo continuar a partir de
`origin/develop`, empurrar o merge da 012 primeiro, senão o trabalho local desta sessão fica
invisível para quem só vê o remoto. Com 012 mesclada, a suíte local de `develop` tem 405/405
testes `api` + 20/20 `shared`, `tsc`/build limpos em `shared`/`api`/`front`. **Pendente:
aplicar as migrations `0008` a `0015` em staging e produção** — só locais até agora (ver
"Ambientes / Infra" acima).

**010 (check-in de membros) mesclada via PR #10**. Migration `0013` (`member_checkins`/
`member_checkin_events`, espelhando `candidate_checkins`/`checkin_events` da FEAT-0005). Tela
`front/app/painel/check-in-membros/`, item de nav próprio. A US3 (sinalização online/presencial)
mexeu em código já existente da FEAT-0005 (`checkin.repository/service.ts` e
`check-in/_components/candidate-row.tsx`), não numa tela nova. **Achado durante a
implementação**: o `PUT .../checkin` de candidato não devolve `attendance` no envelope — a
atualização otimista do front (`lib/checkin/queries.ts`) por isso invalida a lista em
`onSettled` depois do patch local, em vez de tentar adivinhar a modalidade no cliente.

**012 (organização automática de grupos) implementada na branch
`claude/feat-0012-organizacao-grupos`** (ainda não mesclada em `develop` no momento desta
nota). 405/405 testes `api` (39 novos: 15 do algoritmo puro D1/D5 sem D1 real, 12 de service
com D1 real, 12 de rota HTTP), 20/20 `shared`, `tsc`/build limpos em `shared`/`api`/`front`.
Migration `0014` reconstrói `groups`/`group_evaluators`/`group_candidates` (órfãs desde a
`0001`) com `process_id NOT NULL`, `room_id` agora nullable (`NULL` = grupo online) e
`modality`. Tela nova `front/app/painel/grupos/`, item de nav próprio.

**Decisão tomada durante a spec da 012** (ambiguidade real do backlog, não travada antes):
candidatos presentes online (D7) formam grupos próprios, separados dos presenciais, seguindo
D1, mas **sem alocação automática de avaliador/host** nesta versão — o modelo de avaliação
remota (quem avalia, por qual canal) ainda não foi decidido, fica para uma iteração futura.

**Dois achados de design durante a implementação da 012**:
- `GroupCandidate` (contrato de resposta) **não inclui `gender`** — mesma postura de
  `CandidateCheckinItemSchema` (FEAT-0005): dado sensível de inscrição, nunca exposto por
  pessoa numa listagem comum. D1 é verificado só no backend; uma violação chega ao front como
  o aviso `GENDER_RULE_VIOLATED` do `PATCH .../candidates|evaluators/{id}` (US2), sem
  identificar quem.
- Avaliadores/hosts são alocados aos grupos presenciais em round-robin entre **todos** os
  grupos formados, não "por sala" — `member_checkins`/`edition_hosts` não carregam `room_id`,
  então não existe, no modelo de dados, nenhuma associação prévia de avaliador a uma sala
  específica antes da organização em si.

**013 (avaliação dos candidatos) implementada na branch
`claude/feat-0013-avaliacao-candidatos`** (em cima da `claude/feat-0012-organizacao-grupos`
— dependência real, ainda não em `develop`). 436/436 testes `api` (31 novos: 6 unitários de
`computeVerdict`, 11 de service com D1 real, 14 de rota HTTP), 20/20 `shared`, `tsc`/build
limpos em `shared`/`api`/`front`. Migration `0015` dropa `metrics` (sem substituta, zero uso
em código de produção) e reconstrói `evaluations` (uma linha por par avaliador/candidato) +
`evaluation_scores` (uma nota 0-5 por critério) — design antigo de `evaluations` (cor por
critério em vez de cor geral + notas) não servia ao requisito. Telas novas
`front/app/painel/minhas-avaliacoes/` (avaliador/host) e `front/app/painel/avaliacoes/`
(admin), itens de nav próprios.

Critérios e pesos fixos no código (`shared/src/schemas/evaluation.schema.ts`, não
editáveis por admin nesta versão): Raciocínio lógico 25%, Trabalho em equipe 25%,
Liderança 20%, Proatividade 15%, Comunicação 15%. Notas 0-5 por critério; 1 cor geral
(RED/YELLOW/GREEN) por avaliação, escolhida pelo avaliador — não derivada das notas.

**Veredito (D2 + D6) é calculado na leitura, nunca persistido**: qualquer avaliação `RED`
reprova o candidato imediatamente (D2, veto — não espera atingir o mínimo de avaliações de
D6); sem `RED` e com menos de 2 avaliações, fica pendente (D6); com 2+ e nenhuma `RED`, é
aprovado. Os pesos dos critérios viram uma **pontuação ponderada de referência** exibida ao
admin (`deriveWeightedScore`), mas nunca decidem o veredito.

**Elegibilidade reaproveita a FEAT-0012 sem tabela nova**: um avaliador só pode avaliar
candidatos do próprio grupo presencial — checado via `GroupRepository.findEvaluatorGroup`/
`findCandidateGroup` (já existentes), comparando o `id` do grupo. Nenhum vínculo
avaliador↔candidato duplicado numa tabela própria.

**Limitações registradas como Assumption na spec, não bloqueantes**: a FEAT-0012 não
garante a composição operacional planejada de avaliadores por grupo (1 host + 1-2
avaliadores, D6 min 2/max 3) — quem estiver no grupo avalia, sejam quantos forem; avaliação
de candidatos em grupos **online** fica fora de escopo (FEAT-0012 não aloca avaliador a
esses grupos ainda).

**Achado de limpeza durante a implementação**: `MetricRow`/`EvaluationRow`/`EvaluationStatus`
em `database.schema.ts` eram scaffolding morto desde a `0001-schema.sql` (zero uso em código
de produção, confirmado por busca) — removidos ao reconstruir as tabelas, em vez de deixados
apontando para um schema que não existe mais.

**D7 esclarecido nesta feature**: a linha original do `task.md` amarrava "check-in de
membros" e "sessão online por restrição de sábado" como a mesma coisa — mas
`saturday_restriction` só existe em `candidates`/`candidate_applications`, nunca em membro.
A spec da 010 confirmou com o usuário: online/presencial é atributo do **candidato**
presente, consumido depois pela FEAT-0012 (grupos), não um estado do avaliador/host.

**009, 014, 015 e 016 foram implementadas em paralelo**, cada uma num git worktree/branch
própria, e mescladas em sequência (009 → 014 → 016 → 015, por número de migration crescente
+ 015 por último por tocar mais arquivos de front em comum com 016). Conflitos de merge reais,
todos resolvidos manualmente:
- `api/src/index.ts` e `shared/src/index.ts` — cada feature nova monta seu próprio router/CORS
  e exporta seu próprio schema; sempre aditivo, sem perda.
- `front/app/painel/dashboard-screen.tsx` — 016 (botão de exportar) e 015 (filtro de curso)
  mexeram no mesmo bloco de filtros da tabela; unidos manualmente.
- Duas specs paralelas (015 e 016) numeraram a própria pasta como `specs/012-*` — cada worktree
  só via os specs do próprio checkout e calculou "o próximo livre" de forma independente.
  Renomeadas para `015-filtro-por-curso`/`016-exportacao-csv-candidatos` antes do merge, para
  bater com a numeração real do backlog.
- **Integração descoberta só no merge**: a exportação CSV (016) foi implementada sem saber do
  filtro por curso (015, paralela) — o parâmetro `course` foi adicionado a
  `ExportCandidatesQuerySchema` depois do merge das duas, para o botão de exportar respeitar
  o mesmo recorte visível na tabela. Tratada como tarefa pequena (ver "Convenção" em `task.md`),
  sem novo ciclo de spec-kit.
- 009 (`edition_hosts` — tabela-de-fatos, R1) e 016 (log de auditoria `candidate_export_events`,
  append-only) reaproveitam padrões já estabelecidos (`SelectionProcessRepository.resolveCurrent()`,
  `checkin_events`), sem duplicar conceito nenhum.
- 016 rendeu um bug real encontrado e corrigido pelo próprio agente: o refinamento de data em
  `export.schema.ts` (copiado de `dashboard.schema.ts`) lançava `RangeError` em vez de falhar a
  validação como 400 para entrada malformada — o mesmo padrão ainda existe, intocado, em
  `DateOnlySchema` de `dashboard.schema.ts` (candidato a follow-up).
- 014 rendeu outra correção real: o rascunho inicial do contrato supunha `422` para erro de
  validação; corrigido para `400`, seguindo o padrão real já em produção nessa rota.

Duas correções ao que este documento previa antes de implementar:
- A função de senioridade (D3) chama-se `isEligibleToAnchorTrainee`, não `canQualifyTrainee`
  como especulado abaixo — nome decidido durante o `/speckit-plan`, não antes.
- **A janela das tabelas órfãs (`rooms`, `groups`, `evaluations`...) já fechou quase toda**:
  `rooms` deixou de estar órfã com a 011 (ganhou CRUD e um índice único de nome, migration
  `0009`). `groups`/`group_evaluators`/`group_candidates` deixaram de estar órfãs com a 012
  (migration `0014` — ver acima). `evaluations`/`metrics` continuam vazias e órfãs — a nota
  abaixo sobre `DROP`/`CREATE` trivial ainda vale para essas duas, agora antes da 013.

**Decisões travadas antes de virarem spec** — devem entrar no texto do `/speckit.specify` de cada feature, porque contexto de conversa não sobrevive à sessão:

| # | Decisão |
|---|---|
| D1 | Grupo tem 0 ou ≥2 mulheres, **nunca exatamente 1**. Sobra ímpar vira trio. Restrição forte. |
| D2 | Veredito da avaliação: **qualquer VERMELHO reprova**. Sem empate possível. |
| D3 | `MemberStatus` vira `active` \| `post_junior` \| `trainee` (renomeado de `inactive` → `post_junior` em 2026-09-04, migration `0016` — nome antigo lia como "desligado", o oposto do que significava). `alumni` e `on_leave` saem. |
| D4 | Host é atribuição **por edição do processo seletivo**, não papel global em `roles`. |
| D5 | ~~Salas: ≤50 → 1 host / 2 grupos; 51–80 → 2 hosts / 3 grupos; >80 → 2 hosts / 4 grupos.~~ **Substituída pela D8 na FEAT-0023** — host/grupos vêm da classificação da sala, não da lotação. Continua valendo: `deriveRoomCapacity` é a única fonte disso, e a FEAT-0012 optou por **não** reimplementar o "3 grupos em falta de sala" da formulação original — trata capacidade insuficiente avisando o admin (quantos candidatos ficaram sem grupo), não inflando `maxGroups` além do cadastrado. |
| D6 | Sem o mínimo de 2 avaliações, o candidato fica **pendente** e não recebe veredito. |
| D7 | "Online" é derivado de `saturday_restriction` do **candidato** — um eixo só, nenhum campo novo em `candidates`. Confirmado na FEAT-0010: não é atributo do membro/avaliador. |
| D8 | Sala é classificada, não medida (FEAT-0023, substitui a D5): **sala comum → 1 host / 2 grupos; anfiteatro → 2 hosts / 4 grupos**. `rooms.size` deixou de existir (migration `0016`) — a capacidade de candidatos de uma sala passa a ser `maxGroups * 7` (comum 14, anfiteatro 28). A faixa intermediária de 3 grupos sumiu junto. |

> ⚠️ **D3 enganava antes de 2026-09-04, agora está corrigida.** O nome `inactive` para pós-júnior lia como "desligado", o oposto do que significava — por isso a regra "trainee precisa de um `active` ou `post_junior` ao lado" é exposta no `shared` com nome próprio, `isEligibleToAnchorTrainee(status)` (`shared/src/schemas/member.schema.ts`), nunca como comparação de strings espalhada pelo código. D3 também foi o motivo de a aprovação de cadastro (008, já feita) ter sido a **primeira** feature da cadeia: pós-júnior precisava conseguir entrar na plataforma para poder avaliar, e antes da 008 `ELIGIBLE_MEMBER_STATUSES` só aceitava `active`.
>
> **Emenda de 2026-09-04 (ainda na 008, sem spec nova):** a Supabase da tec passou a devolver só efetivados. `post_junior`/`trainee` deixaram de vir de lá — a tela de cadastro (`/cadastro`) ganhou 3 opções (Efetivo/Trainee/Pós-júnior); as duas últimas se auto-declaram (nome, telefone, curso, semestre, gênero, etnia, sem data de nascimento) numa rota nova e pública, `POST /auth/signup-requests`, sem tocar a Supabase. `member_id` de quem se auto-declara é um uuid sintético `self:<uuid>` (`newSelfDeclaredMemberId`). `POST /auth/register` (trilha Efetivo) passou a exigir `status === "active"` — qualquer outro valor é 403, não vira mais fila de aprovação. O rename `inactive`→`post_junior` é a migration `0016` (aditiva — dois `UPDATE`), mas acoplada ao deploy do Worker; `normalizeStoredMemberStatus` (`shared/src/schemas/member.schema.ts`) traduz o legado na leitura para a ordem não importar. Tudo documentado como emenda dentro de `specs/008-member-status-approval/` (spec.md, research.md R6-R8, data-model.md, contracts, plan.md, quickstart.md) — nenhuma spec nova foi criada.

**Janela que se fecha:** `rooms`, `groups`, `group_evaluators`, `group_candidates`, `evaluations` e `metrics` existiam desde a `0001-schema.sql`, vazias e sem nenhum código as referenciando. `rooms` deixou de estar órfã na 011; `groups`/`group_evaluators`/`group_candidates` deixaram de estar órfãs na 012 (migration `0014` — `DROP`/`CREATE` trivial, tabelas confirmadas vazias, sem `MAINTENANCE_MODE`; ver research.md D-tech1 da FEAT-0012). Restam `evaluations` e `metrics`, ainda vazias e órfãs — `evaluations` está errada para o requisito (repete cor e observação por critério). Corrigir antes da 013 continua sendo `DROP`/`CREATE` trivial; depois de povoadas, vira o procedimento perigoso da `0004`. **Confirmar que seguem vazias em staging e produção antes da 013.**

Ainda sem dono e fora das nove: CRUD de processos seletivos, contador "X de Y presentes" no cabeçalho, dark mode, e as duas telas de estado que faltam no Stitch ("nenhum candidato inscrito" e "sem processo corrente").

## Onde procurar mais contexto

- Convenções de código e regras de SDD: `AGENTS.md` (raiz), `front/AGENTS.md`, `api/AGENTS.md` (+ `.agents/*/SKILL.md`).
- Contratos de feature: `specs/`.
