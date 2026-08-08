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
- **Migrations do D1** precisam ser aplicadas por ambiente (`wrangler d1 migrations apply <DB> --remote`). A `0004-normalize-course-slugs.sql` é a mais recente.
- **Existe CD por push, e ele sobrescreve deploy manual.** `master` → produção e `develop` → staging, tanto na Cloudflare (Worker) quanto na Vercel (front). Consequência prática: um `wrangler deploy --var ...` feito à mão é substituído pelo deploy do CD se houver um push logo em seguida — foi o que aconteceu na 0004, com o CD revertendo `MAINTENANCE_MODE` para `"false"` 18s depois do deploy manual. **Faça o push antes**, e só então o deploy manual de manutenção.
- **Deploy da Cloudflare não propaga na hora.** Depois de um deploy, as duas versões convivem por algumas dezenas de segundos e as requisições alternam entre elas (na 0004 o 503 só apareceu ~40s depois, e ainda oscilou). Nunca presuma que o modo de manutenção está no ar: sonde o endpoint até obter várias respostas 503 seguidas antes de mexer no banco.
- **Modo de manutenção (`MAINTENANCE_MODE`):** var em `wrangler.jsonc` que, quando `"true"`, faz `/candidate/*` responder 503 sem gravar nada. Existe para fechar a janela de escrita em migrations que reconstroem tabelas: **deploy com `"true"` → migration → deploy com `"false"`**. Deve estar `"false"` em todo deploy normal — se inscrições estiverem retornando 503, confira essa var antes de investigar qualquer outra coisa.
- **Reconstruir tabela com filhos no D1 é operação de risco.** `candidates` tem três filhos, dois com `ON DELETE CASCADE`. Um `DROP TABLE candidates` apaga todas as inscrições, e nem `PRAGMA defer_foreign_keys` nem `legacy_alter_table` evitam isso (`PRAGMA foreign_keys = OFF` não existe no D1). Pior: o `foreign_key_check` posterior volta limpo, então a migration parece ter dado certo. O padrão que funciona está na `0004`: copiar os filhos para tabelas sem FK, dropar os filhos antes do pai, reconstruir e restaurar.

## Backlog conhecido (`task.md`)

- [ ] Inscrição do candidato na plataforma
- [ ] Inscrição dos avaliadores na plataforma — specs de backend e UI prontas (FEAT-0003), implementação não começou. Pendências que não são código: calibrar as iterações do PBKDF2 medindo em produção, criar a regra de Rate Limiting em `/auth/*`, e desenhar a tela "Definir Nova Senha" (sem ela o fluxo de recuperação de senha não fecha).

## Onde procurar mais contexto

- Convenções de código e regras de SDD: `AGENTS.md` (raiz), `front/AGENTS.md`, `api/AGENTS.md` (+ `.agents/*/SKILL.md`).
- Contratos de feature: `specs/`.
