<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Frontend Guidelines (Next.js 16 + React 19)

## 1. Integração com o Backend e Workspace Shared (SDD)

> [!WARNING]
> **REGRA CRÍTICA:** O projeto utiliza Spec-Driven Development (SDD).

- **Contratos da API:** NUNCA crie interfaces locais para payloads de requests ou responses (DTOs).
- Importe **sempre** os contratos e os tipos a partir do pacote `shared` (ex: `import { UserSchema, type UserRow } from 'shared'`).
- Leia e siga a documentação de feature na pasta `../specs/` antes de escrever componentes e lógica.

## 2. Componentes e Estilização

- Utilize **TailwindCSS v4**. Não utilize diretivas ou configs obsoletas do v3.
- Mantenha componentes puramente visuais na pasta `components/` se houver, ou colocalizados se pertencerem a apenas uma rota.
- Dê preferência a cores dinâmicas e design moderno (Dark mode, glassmorphism e micro-animações se cabível).

## 3. App Router (Server vs Client)

- Todo o roteamento é feito na pasta `app/`.
- Mantenha Server Components sempre que possível (esse é o comportamento padrão).
- Adicione `"use client"` apenas no topo de componentes que de fato requerem interatividade no navegador (ex: hooks do React como `useState`, ou event listeners de DOM como `onClick`).

## 4. Validação e Formulários

- Utilize `react-hook-form` associado ao `@hookform/resolvers/zod` consumindo DIRETAMENTE os schemas zod exportados do pacote `shared` (ex: `CreateUserSchema`).
- Não reescreva validações (min/max de strings) no front-end caso elas já existam no schema do pacote shared.
