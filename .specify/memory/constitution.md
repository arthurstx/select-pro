# Select Pro Constitution

Princípios não-negociáveis deste monorepo. Todo comando do Spec Kit (`specify`, `plan`,
`tasks`, `analyze`, `implement`) valida seu resultado contra este documento. Convenções de
código do dia a dia vivem em `AGENTS.md`; estado operacional vive em `CONTEXT.md`. Aqui
ficam apenas as regras cuja violação invalida a entrega.

## Core Principles

### I. Contrato Compartilhado Como Fonte da Verdade (NÃO-NEGOCIÁVEL)

Todo contrato que atravessa a fronteira front/api — payload de request, shape de response,
modelo de domínio — é declarado como schema Zod em `shared/src/schemas/` e importado do
workspace `shared` pelos dois lados (`import { UserSchema, type User } from "shared"`).

É proibido: declarar interface local de DTO no `front/` ou no `api/`; reescrever no front
uma validação (min/max, regex, obrigatoriedade) que já existe no schema compartilhado;
manter dois tipos que descrevem a mesma coisa.

Rationale: contratos duplicados divergem silenciosamente — o front continua compilando
depois que o back mudou o shape, e a quebra só aparece em runtime, em produção. A regra
existe para que o compilador seja quem detecta a divergência.

### II. Spec Antes de Código (NÃO-NEGOCIÁVEL)

Nenhuma feature relevante é implementada sem spec correspondente em `specs/`. A ordem é
fixa: spec → aprovação humana se a spec mudar → contrato em `shared/src/schemas/` →
implementação no `api/` → implementação no `front/`.

"Relevante" significa: muda o contrato da API, adiciona rota, muda o schema do banco, ou
altera um fluxo que o usuário final percebe. Correção de bug, refactor sem mudança de
comportamento e ajuste de estilo não exigem spec.

A spec descreve comportamento e critérios de aceite, não implementação. Decisões técnicas
pertencem ao `plan`.

Rationale: o contrato precisa ser acordado antes de existir código dos dois lados, senão a
"integração" vira negociação retroativa entre duas implementações já prontas.

### III. O Banco É Insubstituível

Migrations do D1 que reconstroem tabelas são a operação de maior risco deste projeto e
seguem procedimento obrigatório:

- Reconstrução de tabela com filhos segue o padrão da migration `0004`: copiar filhos para
  tabelas sem FK → dropar filhos → reconstruir o pai → restaurar. `PRAGMA foreign_keys =
  OFF` não existe no D1, e nem `defer_foreign_keys` nem `legacy_alter_table` protegem os
  filhos de um `DROP TABLE` no pai.
- Migration destrutiva exige janela de manutenção: deploy com `MAINTENANCE_MODE="true"` →
  confirmar 503 sondando o endpoint repetidamente → migration → deploy com `"false"`.
  Migration puramente aditiva dispensa a janela.
- Migrations são aplicadas por ambiente, explicitamente. Staging antes de produção, sempre.
- Toda mudança que muda o shape de tabela existente exige que o plano diga, em uma frase, o
  que acontece com os dados já gravados.

Rationale: `foreign_key_check` volta limpo depois de um cascade destrutivo — o banco
reporta sucesso sobre dados que não existem mais. Não há sinal automático de que deu
errado, então o procedimento precisa ser seguido antes, não verificado depois.

### IV. Orçamento da Plataforma É Requisito de Design

O Worker roda no plano Free da Cloudflare. Os limites abaixo são premissa de arquitetura,
não detalhe de otimização, e o `plan` de qualquer feature que esbarre neles deve dizer como
cabe:

- **10 ms de CPU por invocação.** I/O (fetch, D1, KV) não conta. Na prática só criptografia
  chega perto. Estourar não é degradação sob carga: é `Error 1102` determinístico. E
  `wrangler dev` não aplica o teto — só dá para medir em produção.
- **Cloudflare Queues indisponível** (exige plano pago). Trabalho assíncrono usa
  `waitUntil` ou cron.
- **Uma única regra de Rate Limiting no WAF.** Escolher onde gastá-la é decisão de spec.
- **TTL mínimo de 60 s no KV.** `expirationTtl` menor faz o `put` falhar. Invalidação mais
  fina que isso precisa ser por geração/versão de chave.

Rationale: esses limites já mudaram o desenho de features anteriores. Descobri-los durante
a implementação custa retrabalho; descobri-los em produção custa incidente.

### V. Backend Novo Vem Com Testes

Toda rota ou service novo no `api/` entrega testes junto, no padrão já estabelecido em
`api/test/`: `<feature>.service.test.ts` para a regra de negócio e
`<feature>.routes.test.ts` para o contrato HTTP (status, shape da response, códigos de
erro). A suíte roda com `vitest-pool-workers` e precisa passar antes do merge.

Testes não dependem de configuração local: o que o ambiente do desenvolvedor define
(`.dev.vars`, bypasses) é fixado explicitamente no `testEnv()` do teste.

Rationale: o teste de rota é o único lugar onde o contrato do Princípio I é verificado
executando. Sem ele, "o schema está em `shared`" é afirmação, não fato. O TDD estrito não é
exigido — a existência dos dois testes, sim.

## Restrições Tecnológicas

Stack fixa. Trocar qualquer item abaixo é emenda constitucional, não decisão de plano:

- **Monorepo** npm workspaces: `front/`, `api/`, `shared/`, `specs/`.
- **Backend:** Hono + Cloudflare Workers, D1 (SQL), KV (cache), `@hono/zod-openapi` para
  validação e documentação.
- **Frontend:** Next.js 16 (App Router) + React 19 + TailwindCSS v4. Server Components por
  padrão; `"use client"` apenas onde há interatividade real. Formulários com
  `react-hook-form` + `@hookform/resolvers/zod` consumindo os schemas do `shared`
  diretamente.
- **Contratos:** Zod, em `shared/src/schemas/`.

Segredos (`JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, chaves de terceiros)
nunca entram em `wrangler.jsonc`, em arquivo commitado ou em spec — apenas
`wrangler secret put`. A `service_role` da Supabase ignora RLS e dá acesso total ao banco da
tec: tratá-la como credencial de produção mesmo em staging.

## Fluxo de Desenvolvimento

1. `specify` — spec em `specs/`, revisada por humano antes de seguir.
2. `plan` — decisões técnicas, incluindo impacto em migration e em orçamento de plataforma
   quando houver.
3. `tasks` — quebra ordenada por dependência.
4. `implement` — contratos em `shared/` primeiro, depois `api/`, depois `front/`.

Branches de feature nascem de `develop`. `develop` → staging e `master` → produção, via CD
por push nos dois provedores (Cloudflare e Vercel). Consequência que já causou incidente:
**deploy manual feito antes de um push é sobrescrito pelo CD.** Empurre primeiro, faça o
deploy manual depois.

Deploy da Cloudflare não propaga na hora — as duas versões convivem por dezenas de segundos
e as requisições alternam. Nunca presuma que uma var (`MAINTENANCE_MODE` inclusive) já está
no ar: sonde até obter várias respostas consistentes.

Contexto operacional que precisa sobreviver entre sessões, agentes ou dispositivos vai para
`CONTEXT.md` e é commitado. O ponto de sincronização é o GitHub — memória local de agente
não atravessa máquina.

## Governance

Esta constituição prevalece sobre `AGENTS.md`, `CONTEXT.md` e sobre qualquer spec. Em caso
de conflito, o mais restritivo vence e a divergência é resolvida por emenda, não por
exceção pontual.

Emendas exigem: justificativa escrita no commit, atualização do bloco de versão abaixo e,
quando a mudança afeta artefatos existentes (templates, specs abertas), a lista do que
precisa ser atualizado.

Versionamento semântico: **MAJOR** para remoção ou redefinição incompatível de princípio;
**MINOR** para princípio ou seção nova; **PATCH** para clarificação que não muda o que é
exigido.

Toda violação consciente de princípio precisa estar registrada na seção de Complexity
Tracking do `plan.md` da feature, com a alternativa mais simples que foi rejeitada e o
motivo. Violação não registrada é bug de processo.

**Version**: 1.0.0 | **Ratified**: 2026-08-24 | **Last Amended**: 2026-08-24
