# SelectPro — Frontend

Frontend web do SelectPro (CIMATEC Jr.), construído com **Next.js 16 (App Router)** e **React 19**. Faz parte do monorepo `select-pro`; contratos de API são importados do workspace [`shared`](../shared) — ver [`AGENTS.md`](../AGENTS.md) na raiz para as regras de Spec-Driven Development do projeto.

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

| Variável | Descrição | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL da API (workspace `api`) | `http://localhost:8787` |

Ver [`app/inscricao/_lib/api.ts`](app/inscricao/_lib/api.ts).

## Estrutura do projeto

```
app/
├── page.tsx                    # Home
├── providers.tsx                # QueryClientProvider (TanStack Query)
└── inscricao/                   # Feature: inscrição de candidato (FEAT-0001)
    ├── layout.tsx                # Envolve as rotas com RegistrationProvider
    ├── page.tsx                  # Passo 1 — formulário de pré-cadastro
    ├── verificar/page.tsx        # Passo 2 — confirmação do código OTC
    ├── sucesso/page.tsx          # Passo 3 — confirmação de sucesso
    ├── _components/              # Componentes de UI da feature (privados à rota)
    ├── _context/                 # Estado da inscrição em memória (React Context)
    ├── _hooks/                   # Hooks TanStack Query (mutations)
    └── _lib/                     # Cliente HTTP da API + mapeamento de erros
```

Componentes reutilizáveis entre features (shadcn/ui) vivem em [`components/`](components) na raiz do workspace. Pastas com prefixo `_` (`_components`, `_hooks`, `_lib`, `_context`) são privadas à rota e não geram segmentos de URL (convenção do Next.js App Router).

## Fluxo da feature de inscrição (`/inscricao`)

Especificação completa em [`specs/0001-registrate-candidate-ui.md`](../specs/0001-registrate-candidate-ui.md). Resumo do fluxo:

1. **`/inscricao`** — [`CandidateRegistrationForm`](app/inscricao/_components/candidate-registration-form.tsx) coleta os dados do candidato e chama `POST /candidate/pre-register` (hook [`usePreRegister`](app/inscricao/_hooks/use-pre-register.ts)). Em caso de sucesso, `pendingId`/`expiresAt` são guardados no [`RegistrationContext`](app/inscricao/_context/registration-context.tsx) e o usuário é levado para `/inscricao/verificar`.
2. **`/inscricao/verificar`** — [`OtcVerificationForm`](app/inscricao/_components/otc-verification-form.tsx) coleta o código de 6 dígitos recebido por email e chama `POST /candidate/confirm-otc` (hook [`useConfirmOtc`](app/inscricao/_hooks/use-confirm-otc.ts)). Redireciona para `/inscricao` se não houver `pending` no contexto (ex.: F5 na página).
3. **`/inscricao/sucesso`** — Exibe os dados do candidato confirmado. Redireciona para `/inscricao` se não houver `confirmed` no contexto.

Erros que a tela de verificação não consegue corrigir (código expirado, tentativas excedidas, conflito de email/telefone) usam o componente compartilhado [`RegistrationBlocked`](app/inscricao/_components/registration-blocked.tsx), que reinicia o fluxo do zero.

**Nota sobre estado:** o progresso da inscrição vive apenas em memória (`useState` no `RegistrationContext`) — nunca em `localStorage`/`sessionStorage`/query string. Um F5 nas telas de verificação/sucesso reseta o fluxo por design.

## Integração com a API

- Contratos de request/response (`PreRegisterRequest`, `ConfirmOtcResponse`, `ErrorResponseSchema`, etc.) vêm **exclusivamente** do pacote `shared` — nunca duplicados aqui (ver [`app/inscricao/_lib/api.ts`](app/inscricao/_lib/api.ts) e [`app/inscricao/_lib/api-error.ts`](app/inscricao/_lib/api-error.ts)).
- Respostas de erro seguem o envelope `{ error: { code, message, field? } }`; `toApiError` converte isso numa `ApiError` tipada consumida pelos formulários.
- A documentação interativa (Swagger UI) dos endpoints consumidos por este frontend fica em `${NEXT_PUBLIC_API_URL}/docs` quando a API (workspace `api`) está rodando — ver [`api/README.md`](../api/README.md).

## Scripts

```bash
npm run dev --workspace=front     # servidor de desenvolvimento
npm run build --workspace=front   # build de produção
npm run start --workspace=front   # serve o build de produção
npm run lint --workspace=front    # eslint
```
