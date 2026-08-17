# Contexto Operacional (para qualquer agente)

Este arquivo guarda contexto operacional/de estado que não vive no código nem nas specs, para que qualquer agente (Claude Code local, Claude Code na web, outro contribuidor humano) parta do mesmo entendimento ao assumir este projeto. Ele complementa, mas não substitui, `AGENTS.md` (convenções) e `specs/` (contratos de feature).

## Fluxo multi-dispositivo / multi-agente

- Sessões de terminal (CLI) do Claude Code rodam **localmente** na máquina onde foram abertas e não sincronizam entre dispositivos (ex: celular) nem entre si — cada sessão tem seu próprio histórico e memória.
- O ponto de sincronização entre agentes/dispositivos é o **GitHub** (`origin`: `github.com/arthurstx/select-pro`). Qualquer contexto que precise sobreviver entre sessões/dispositivos deve estar commitado e enviado (`git push`).
- Uma sessão do Claude Code na web (claude.ai/code) parte do zero: não tem acesso à memória local nem ao histórico de conversa de sessões de terminal. Ela só enxerga o que está no repositório remoto.

## Branches

- `master`: produção.
- `develop`: branch de integração ativa.
- Branches de feature nascem de `develop` (ex: `feat/wizard-inscricao-6-etapas`, já mergeada; `feat/remover-otc-inscricao-passo-unico`, em PR; `feat/auth-membro`, com as specs do FEAT-0003 e nenhuma implementação ainda).

> ⚠️ Antes de assumir que `develop` e `master` estão sincronizados, rode `git log master..develop` e `git log develop..master` — historicamente já divergiram nas duas direções (features prontas em `develop` aguardando promoção, e commits de deploy direto em `master`).

## Ambientes / Infra (Cloudflare Worker `api/`)

- `api/wrangler.jsonc` define os bindings por ambiente (D1, vars). Ao alterar `database_name`/`database_id`, confirme qual ambiente (staging vs produção) está sendo afetado antes de commitar — esses valores têm mudado localmente sem commit correspondente em algumas sessões.
- **O Worker roda no plano Free da Cloudflare.** O limite que importa é **10 ms de CPU por invocação** — tempo de I/O (fetch, D1, KV) não conta. Na prática quase nada esbarra nisso, exceto criptografia: o hash de senha do FEAT-0003 é o primeiro código do projeto que precisa ser calibrado para caber. Estourar o limite não é falha sob carga, é `Error 1102` determinístico, e `wrangler dev` **não** aplica o teto — só dá para medir em produção. Consequências no mesmo plano: **Cloudflare Queues indisponível** (exige plano pago) e apenas **uma** regra de Rate Limiting no WAF.
- **Sem provedor de email desde FEAT-0001 v3.0, mas o Resend volta no FEAT-0003.** A remoção do OTC eliminou o mailer, a dependência e as vars `RESEND_*`; o fluxo de recuperação de senha o traz de volta, só que restrito a `/auth/forgot-password` e fora do caminho crítico (`waitUntil`). O secret `RESEND_API_KEY` pode continuar existindo nos Workers (`api`, `api-staging`), porque a v3.0 removeu o código sem rodar `wrangler secret delete` — **conferir com `wrangler secret list` antes de recriar.**
- **Secrets e vars que o FEAT-0003 exige e ainda não existem:** secrets `JWT_SECRET` e `SUPABASE_SERVICE_ROLE_KEY`; vars `SUPABASE_URL` e `FRONT_ORIGIN` (origin explícita do front — o `cors()` atual reflete qualquer origin, o que é correto para `/candidate/*` e inaceitável em `/auth/*`, que trafega cookie). A `service_role` ignora RLS e dá acesso total ao banco da tec: nunca em `wrangler.jsonc`.
- **KV `PENDING_REGISTRATIONS`:** não é mais referenciado no `wrangler.jsonc`. Os namespaces seguem existindo na conta Cloudflare (ids `c7ac7d5d…` produção e `0a7885b8…` staging) e podem ser deletados manualmente.
- **Migrations do D1** precisam ser aplicadas por ambiente (`wrangler d1 migrations apply <DB> --env staging --remote`). A `0006-candidate-checkin.sql` é a mais recente. ⚠️ **Aplicar a migration não é opcional nem silencioso:** com o Worker novo no ar e o banco sem as tabelas, `GET /candidates` responde `409 NO_ACTIVE_SELECTION_PROCESS` — o erro parece de configuração de processo seletivo, mas a causa é a migration que faltou.
- **KV `CANDIDATES_KV`** (`51d028fb…` produção, `b904715d…` staging): cache da listagem do check-in. TTL de 60s — que é o **mínimo** que o KV aceita em `expirationTtl`; valores menores fazem `kv.put` falhar. A invalidação real é por geração (um contador por processo, incrementado a cada marcar/desmarcar), então o TTL só limita o pior caso.
- **`MEMBER_DIRECTORY_BYPASS=true` em `api/.dev.vars`** pula a checagem de membro na Supabase no cadastro local, porque `wrangler dev` usa o bloco **raiz** do `wrangler.jsonc` (não existe env "development") e o `SUPABASE_URL` de lá aponta para um projeto real. O wrangler nunca aplica `.dev.vars` a `deploy`, então staging/produção continuam exigindo membro real sem depender de nenhuma mudança de código. Os testes fixam `MEMBER_DIRECTORY_BYPASS: "false"` no `testEnv()` — o `vitest-pool-workers` também lê `.dev.vars`, e a suíte não pode depender de como cada um configurou o próprio ambiente.
- **Existe CD por push, e ele sobrescreve deploy manual.** `master` → produção e `develop` → staging, tanto na Cloudflare (Worker) quanto na Vercel (front). Consequência prática: um `wrangler deploy --var ...` feito à mão é substituído pelo deploy do CD se houver um push logo em seguida — foi o que aconteceu na 0004, com o CD revertendo `MAINTENANCE_MODE` para `"false"` 18s depois do deploy manual. **Faça o push antes**, e só então o deploy manual de manutenção.
- **Deploy da Cloudflare não propaga na hora.** Depois de um deploy, as duas versões convivem por algumas dezenas de segundos e as requisições alternam entre elas (na 0004 o 503 só apareceu ~40s depois, e ainda oscilou). Nunca presuma que o modo de manutenção está no ar: sonde o endpoint até obter várias respostas 503 seguidas antes de mexer no banco.
- **Modo de manutenção (`MAINTENANCE_MODE`):** var em `wrangler.jsonc` que, quando `"true"`, faz `/candidate/*` responder 503 sem gravar nada. Existe para fechar a janela de escrita em migrations que reconstroem tabelas: **deploy com `"true"` → migration → deploy com `"false"`**. Deve estar `"false"` em todo deploy normal — se inscrições estiverem retornando 503, confira essa var antes de investigar qualquer outra coisa.
- **Reconstruir tabela com filhos no D1 é operação de risco.** `candidates` tem três filhos, dois com `ON DELETE CASCADE`. Um `DROP TABLE candidates` apaga todas as inscrições, e nem `PRAGMA defer_foreign_keys` nem `legacy_alter_table` evitam isso (`PRAGMA foreign_keys = OFF` não existe no D1). Pior: o `foreign_key_check` posterior volta limpo, então a migration parece ter dado certo. O padrão que funciona está na `0004`: copiar os filhos para tabelas sem FK, dropar os filhos antes do pai, reconstruir e restaurar.

## Backlog conhecido (`task.md`)

- [ ] Inscrição do candidato na plataforma
- [ ] Inscrição dos avaliadores na plataforma — specs de backend e UI prontas (FEAT-0003), implementação não começou. Pendências que não são código: calibrar as iterações do PBKDF2 medindo em produção, criar a regra de Rate Limiting em `/auth/*`, e desenhar a tela "Definir Nova Senha" (sem ela o fluxo de recuperação de senha não fecha).

## Próxima spec (FEAT-0006) — escopo já decidido

A FEAT-0005 (check-in) deixou três coisas explicitamente para a spec seguinte. As duas primeiras **precisam existir antes da abertura do segundo processo seletivo** — não são melhorias, são bloqueios.

- [ ] 🔴 **Unicidade de email/telefone por edição.** Hoje `candidates.email` e `candidates.phone` são `UNIQUE` globais (`0004-normalize-course-slugs.sql`), então quem se inscreveu em 2026.1 **não consegue se reinscrever** em 2026.2 — a FEAT-0001 responde `EMAIL_ALREADY_REGISTERED`. Vira `UNIQUE (process_id, email)` / `UNIQUE (process_id, phone)`, o que exige `candidates.process_id` e, por tabela, que a inscrição (FEAT-0001) passe a carimbar a edição corrente.
- [ ] **Padronização do telefone.** Os telefones estão gravados sem formato consistente. A UI do check-in foi escrita para tolerar isso e **não** reformatar no cliente, de propósito: mascarar no front esconderia justamente a inconsistência que esta spec vai corrigir.
- [ ] **Tela de logs do admin, alimentada por webhook.** O dado **já está sendo gravado** desde a FEAT-0005 (`checkin_events`, append-only, com ator/ação/horário). Falta a tela e o webhook. Foi assim de propósito: a tela pode ser construída a qualquer momento, mas só enxerga o que já foi gravado enquanto acontecia.

> ⚠️ **Os dois primeiros itens vão na MESMA migration, numa reconstrução única de `candidates`** — essa é a decisão de maior valor herdada da FEAT-0005, e ela é sobre risco, não sobre esforço. Reconstruir `candidates` é o procedimento mais perigoso deste banco (ver "Ambientes / Infra"): escrever é barato, errar apaga as inscrições, e o `foreign_key_check` posterior volta limpo reportando sucesso sobre um banco destruído. Cada execução é uma aposta; fazer duas apostas para resolver dois problemas da mesma tabela é escolha ruim quando uma resolve os dois. Essa migration precisa de `MAINTENANCE_MODE` — diferente da `0006`, que é puramente aditiva.

Fora de escopo da FEAT-0005 e ainda sem dono (menor urgência): CRUD de processos seletivos, check-in por grupo/sala, avaliação do candidato, contador "X de Y presentes" no cabeçalho, dark mode, e as duas telas de estado que faltam no Stitch ("nenhum candidato inscrito" e "sem processo corrente").

## Onde procurar mais contexto

- Convenções de código e regras de SDD: `AGENTS.md` (raiz), `front/AGENTS.md`, `api/AGENTS.md` (+ `.agents/*/SKILL.md`).
- Contratos de feature: `specs/`.
