# Documentação Principal (Monorepo)

Este é um monorepo gerenciado via **npm workspaces**.
O projeto segue a abordagem **Spec-Driven Development (SDD)**, onde os contratos compartilhados são a única fonte da verdade.

## Estrutura do Monorepo

- `front/`: Frontend web construído com Next.js (React).
- `api/`: Backend construído com Hono + Cloudflare Workers.
- `shared/`: Pacote contendo tipos, schemas Zod (contratos), constantes e erros compartilhados entre front e api.
- `specs/`: Contém as especificações (specs) que descrevem as features antes de serem implementadas.

## Comandos Úteis (Executar na raiz)

- `npm install` - Instala todas as dependências e linka os workspaces (front, api, shared).
- `npm run dev --workspace=front` - Inicia o servidor de desenvolvimento do frontend.
- `npm run dev --workspace=api` - Inicia o servidor de desenvolvimento do backend.

## Regras Core - SDD e Contratos (LEIA COM ATENÇÃO)

> [!WARNING]
> **REGRA DE OURO DOS CONTRATOS:** Contratos entre frontend e backend (ex: payloads de request/response, modelos de domínio) vivem EXCLUSIVAMENTE em `shared/src/schemas`.
> NUNCA duplique tipos no `front/` ou `api/`. Sempre importe do workspace `shared` (ex: `import { UserSchema, User } from "shared";`).

> [!WARNING]
> **REGRA DE OURO DE FEATURES (SDD):** Nenhuma feature relevante é implementada sem uma spec correspondente na pasta `specs/`.

### Fluxo de Trabalho Esperado:
1. Ler/Atualizar a spec correspondente em `specs/`.
2. Aguardar aprovação humana se a spec mudar.
3. Adicionar/Atualizar os contratos (schemas Zod/Tipos) em `shared/src/schemas/`.
4. Implementar a lógica no backend (`api/`) baseada no contrato.
5. Implementar a interface/lógica no frontend (`front/`) baseada no mesmo contrato.

## Documentações Específicas

Para convenções específicas de código, consulte o arquivo `AGENTS.md` dentro de cada workspace correspondente:
- **Frontend Rules:** `/front/AGENTS.md`
- **Backend Skills:** `/api/AGENTS.md`

## Contexto Operacional

Para estado de ambientes, branches, backlog e como o contexto flui entre sessões/dispositivos diferentes, consulte `CONTEXT.md` na raiz.
