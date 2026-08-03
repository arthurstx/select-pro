# SelectPro — Frontend

Frontend web do SelectPro (CIMATEC jr.), construído com **Next.js 16 (App Router)** e **React 19**. Faz parte do monorepo `select-pro`; contratos de API são importados do workspace [`shared`](../shared) — ver [`AGENTS.md`](../AGENTS.md) na raiz para as regras de Spec-Driven Development do projeto.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **TailwindCSS v4** para estilização
- **shadcn/ui** (Radix primitives) para componentes de UI
- **react-hook-form** + **@hookform/resolvers/zod** para formulários, validados com os schemas Zod do pacote `shared`
- **TanStack Query v5** para chamadas e estado assíncrono da API

## Getting Started

Rodar a partir da raiz do monorepo (garante que o workspace `shared` esteja linkado):

```bash
npm install
npm run dev --workspace=front
```

A aplicação sobe em [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

| Variável              | Descrição                         | Default                 |
| --------------------- | --------------------------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL` | Base URL da API (workspace `api`) | `http://localhost:8787` |

Ver [`app/inscricao/_lib/api.ts`](app/inscricao/_lib/api.ts).

## Estrutura do projeto

```
app/
├── page.tsx                    # Home
├── providers.tsx                # QueryClientProvider (TanStack Query)
└── inscricao/                   # Feature: inscrição de candidato (FEAT-0001)
    ├── layout.tsx                # Envolve as rotas com RegistrationProvider
    ├── page.tsx                  # Etapa 1 — Dados Pessoais
    ├── como-conheceu/page.tsx    # Etapa 2 — Como conheceu
    ├── movimento-ej/page.tsx     # Etapa 3 — Movimento EJ
    ├── sobre-voce/page.tsx       # Etapa 4 — Sobre você
    ├── disponibilidade/page.tsx  # Etapa 5 — Disponibilidade e Diversidade
    ├── finalizacao/page.tsx      # Etapa 6 — Finalização (único POST do fluxo)
    ├── sucesso/page.tsx          # Tela terminal — inscrição concluída
    ├── _components/              # Componentes de UI da feature (privados à rota)
    ├── _context/                 # Estado do wizard (sessionStorage) + inscrição (memória)
    ├── _hooks/                   # Hooks TanStack Query (mutations) e guard de navegação
    └── _lib/                     # Cliente HTTP da API + mapeamento de erros
```

Componentes reutilizáveis entre features (shadcn/ui) vivem em [`components/`](components) na raiz do workspace. Pastas com prefixo `_` (`_components`, `_hooks`, `_lib`, `_context`) são privadas à rota e não geram segmentos de URL (convenção do Next.js App Router).

## Fluxo da feature de inscrição (`/inscricao`)

Especificação completa em [`specs/0001-registrate-candidate-ui.md`](../specs/0001-registrate-candidate-ui.md). Resumo do fluxo:

1. **Etapas 1–5** — cada etapa valida seus campos com o schema Zod correspondente do `shared` e grava as respostas no [`RegistrationContext`](app/inscricao/_context/registration-context.tsx). **Nenhuma delas chama a API.** O [`useWizardGuard`](app/inscricao/_hooks/use-wizard-guard.ts) impede pular etapas por URL direta.
2. **Etapa 6 (`/inscricao/finalizacao`)** — [`FinalizationStepForm`](app/inscricao/_components/finalization-step-form.tsx) é o **único ponto de submissão**: envia o payload acumulado via `POST /candidate/register` (hook [`useRegister`](app/inscricao/_hooks/use-register.ts)). Em caso de sucesso, guarda os dados do candidato no contexto, limpa o `sessionStorage` e leva para `/inscricao/sucesso`.
3. **`/inscricao/sucesso`** — Exibe os dados da inscrição criada. Redireciona para `/inscricao` se não houver `registered` no contexto.

> **Não há verificação por código (OTC) desde a FEAT-0001 v3.0.** A inscrição é gravada direto no banco na etapa 6; a rota `/inscricao/verificar` e o input de OTP foram removidos. Ver o changelog da [spec de UI](../specs/0001-registrate-candidate-ui.md).

**Nota sobre estado:** as respostas das etapas 1–5 são espelhadas em `sessionStorage` (sobrevivem a um F5 no meio do wizard); os dados da inscrição criada ficam **só em memória**, para alimentar a tela de sucesso. Um F5 em `/inscricao/sucesso` volta ao início — a inscrição já está gravada, só a tela de exibição é efêmera.

## Integração com a API

- Contratos de request/response (`RegisterRequest`, `RegisterResponse`, `ErrorResponseSchema`, etc.) vêm **exclusivamente** do pacote `shared` — nunca duplicados aqui (ver [`app/inscricao/_lib/api.ts`](app/inscricao/_lib/api.ts) e [`app/inscricao/_lib/api-error.ts`](app/inscricao/_lib/api-error.ts)).
- Respostas de erro seguem o envelope `{ error: { code, message, field? } }`; `toApiError` converte isso numa `ApiError` tipada consumida pelos formulários.
- A documentação interativa (Swagger UI) dos endpoints consumidos por este frontend fica em `${NEXT_PUBLIC_API_URL}/docs` quando a API (workspace `api`) está rodando — ver [`api/README.md`](../api/README.md).

## Scripts

```bash
npm run dev --workspace=front     # servidor de desenvolvimento
npm run build --workspace=front   # build de produção
npm run start --workspace=front   # serve o build de produção
npm run lint --workspace=front    # eslint
```
