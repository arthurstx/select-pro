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

`git worktree list` mostra todos os worktrees ativos e em que branch cada um está.

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
- **Migrations do D1** precisam ser aplicadas por ambiente (`wrangler d1 migrations apply <DB> --env staging --remote`). A `0007-candidate-edition-uniqueness.sql` é a mais recente. ⚠️ **Aplicar a migration não é opcional nem silencioso:** com o Worker novo no ar e o banco sem as tabelas, `GET /candidates` responde `409 NO_ACTIVE_SELECTION_PROCESS` — o erro parece de configuração de processo seletivo, mas a causa é a migration que faltou.
- **KV `CANDIDATES_KV`** (`51d028fb…` produção, `b904715d…` staging): cache da listagem do check-in. TTL de 60s — que é o **mínimo** que o KV aceita em `expirationTtl`; valores menores fazem `kv.put` falhar. A invalidação real é por geração (um contador por processo, incrementado a cada marcar/desmarcar), então o TTL só limita o pior caso.
- **`MEMBER_DIRECTORY_BYPASS=true` em `api/.dev.vars`** pula a checagem de membro na Supabase no cadastro local, porque `wrangler dev` usa o bloco **raiz** do `wrangler.jsonc` (não existe env "development") e o `SUPABASE_URL` de lá aponta para um projeto real. O wrangler nunca aplica `.dev.vars` a `deploy`, então staging/produção continuam exigindo membro real sem depender de nenhuma mudança de código. Os testes fixam `MEMBER_DIRECTORY_BYPASS: "false"` no `testEnv()` — o `vitest-pool-workers` também lê `.dev.vars`, e a suíte não pode depender de como cada um configurou o próprio ambiente.
- **Existe CD por push, e ele sobrescreve deploy manual.** `master` → produção e `develop` → staging, tanto na Cloudflare (Worker) quanto na Vercel (front). Consequência prática: um `wrangler deploy --var ...` feito à mão é substituído pelo deploy do CD se houver um push logo em seguida — foi o que aconteceu na 0004, com o CD revertendo `MAINTENANCE_MODE` para `"false"` 18s depois do deploy manual. **Faça o push antes**, e só então o deploy manual de manutenção.
- **Deploy da Cloudflare não propaga na hora.** Depois de um deploy, as duas versões convivem por algumas dezenas de segundos e as requisições alternam entre elas (na 0004 o 503 só apareceu ~40s depois, e ainda oscilou). Nunca presuma que o modo de manutenção está no ar: sonde o endpoint até obter várias respostas 503 seguidas antes de mexer no banco.
- **Modo de manutenção (`MAINTENANCE_MODE`):** var em `wrangler.jsonc` que, quando `"true"`, faz `/candidate/*` responder 503 sem gravar nada. Existe para fechar a janela de escrita em migrations que reconstroem tabelas: **deploy com `"true"` → migration → deploy com `"false"`**. Deve estar `"false"` em todo deploy normal — se inscrições estiverem retornando 503, confira essa var antes de investigar qualquer outra coisa.
- **Reconstruir tabela com filhos no D1 é operação de risco.** `candidates` tem três filhos, dois com `ON DELETE CASCADE`. Um `DROP TABLE candidates` apaga todas as inscrições, e nem `PRAGMA defer_foreign_keys` nem `legacy_alter_table` evitam isso (`PRAGMA foreign_keys = OFF` não existe no D1). Pior: o `foreign_key_check` posterior volta limpo, então a migration parece ter dado certo. O padrão que funciona está na `0004`: copiar os filhos para tabelas sem FK, dropar os filhos antes do pai, reconstruir e restaurar.

## Backlog conhecido (`task.md`)

- [ ] Inscrição do candidato na plataforma
- [x] Inscrição dos avaliadores na plataforma (FEAT-0003) — **implementada** em backend e UI: 8 rotas em `api/src/routes/auth.routes.ts` (commit `c74781f`) e as telas em `front/app/(auth)/` (`login`, `cadastro`, `recuperar-senha`, `redefinir-senha`). A tela "Definir Nova Senha", antes listada como pendente, existe: `front/app/(auth)/redefinir-senha/`.
  - Pendências que **não são código** e não dá para verificar pelo repositório: calibrar as iterações do PBKDF2 medindo em produção (`wrangler dev` não aplica o teto de 10 ms de CPU) e criar a regra de Rate Limiting do WAF em `/auth/*` — lembrando que o plano Free dá **uma** regra só.

## FEAT-0006 — feita, com um item órfão

Dos três itens que a FEAT-0005 deixou para a spec seguinte, **dois foram implementados** na `0007-candidate-edition-uniqueness.sql`: unicidade de email/telefone por edição (`UNIQUE (process_id, email)` / `(process_id, phone)`, destravando a recandidatura entre semestres) e padronização do telefone para E.164.

- [ ] **Tela de logs do admin, alimentada por webhook.** O dado **já está sendo gravado** desde a FEAT-0005 (`checkin_events`, append-only, com ator/ação/horário). Falta a tela e o webhook.

> ⚠️ Este item **não entrou** no backlog 008–016 abaixo — ele não estava na lista de tarefas que originou aquelas specs. Está aqui para não sumir.

## Backlog de specs 008–016 (organizado em 2026-08-24)

Nove features derivadas de um backlog em texto livre sobre separação automática de grupos, avaliação de candidatos e papéis de host. Ordem por dependência:

```
011 (salas) ──────────────────┐
008 (status) → 009 (host) → 010 (check-in) → 012 (grupos) → 013 (avaliação)

014 (necessidades especiais), 015 (filtro por curso), 016 (exportação CSV) — sem dependência
```

**Decisões travadas antes de virarem spec** — devem entrar no texto do `/speckit.specify` de cada feature, porque contexto de conversa não sobrevive à sessão:

| # | Decisão |
|---|---|
| D1 | Grupo tem 0 ou ≥2 mulheres, **nunca exatamente 1**. Sobra ímpar vira trio. Restrição forte. |
| D2 | Veredito da avaliação: **qualquer VERMELHO reprova**. Sem empate possível. |
| D3 | `MemberStatus` vira `active` \| `inactive` \| `trainee`, onde **`inactive` = pós-júnior**, não "desligado". `alumni` e `on_leave` saem. |
| D4 | Host é atribuição **por edição do processo seletivo**, não papel global em `roles`. |
| D5 | Salas: ≤50 → 1 host / 2 grupos (3 em falta de sala); 51–80 → 2 hosts / 3 grupos; >80 → 2 hosts / 4 grupos. |
| D6 | Sem o mínimo de 2 avaliações, o candidato fica **pendente** e não recebe veredito. |
| D7 | "Online" é derivado de `saturday_restriction` — um eixo só, nenhum campo novo em `candidates`. |

> ⚠️ **D3 é a que mais engana.** Com `inactive` significando pós-júnior, a regra "trainee precisa de um `active` ou `inactive` ao lado" se lê ao contrário em inglês — por isso ela deve ser exposta no `shared` com nome próprio (ex.: `canQualifyTrainee(status)`), nunca como comparação de strings espalhada pelo código. D3 também é o motivo de a aprovação de cadastro (008) ser a **primeira** feature da cadeia: pós-júnior precisa conseguir entrar na plataforma para poder avaliar, e hoje `ELIGIBLE_MEMBER_STATUSES` só aceita `active`.

**Janela que se fecha:** `rooms`, `groups`, `group_evaluators`, `group_candidates`, `evaluations` e `metrics` existem desde a `0001-schema.sql`, **vazias e sem nenhum código as referenciando**. Duas estão erradas para o requisito (`evaluations` repete cor e observação por critério; `groups` não tem `process_id`). Corrigir hoje é `DROP`/`CREATE` trivial, sem `MAINTENANCE_MODE`. Depois de povoadas, vira o procedimento perigoso da `0004`. **Confirmar que seguem vazias em staging e produção antes da 012.**

Ainda sem dono e fora das nove: CRUD de processos seletivos, contador "X de Y presentes" no cabeçalho, dark mode, e as duas telas de estado que faltam no Stitch ("nenhum candidato inscrito" e "sem processo corrente").

## Onde procurar mais contexto

- Convenções de código e regras de SDD: `AGENTS.md` (raiz), `front/AGENTS.md`, `api/AGENTS.md` (+ `.agents/*/SKILL.md`).
- Contratos de feature: `specs/`.
