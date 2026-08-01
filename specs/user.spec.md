# Criação e Gerenciamento de Usuários

## Objetivo
Permitir a criação, listagem e atualização de usuários no sistema para que eles possam assumir papéis como avaliadores.

## Contrato (Schemas Compartilhados)
Esta feature é baseada na tabela `users` do banco de dados (`shared/src/schemas/database.schema.ts` -> `UserRow`).
Os payloads de request e os modelos consumidos estão em:
- `shared/src/schemas/user.schema.ts` -> `UserSchema`
- `shared/src/schemas/user.schema.ts` -> `CreateUserSchema` (para criação)

## Critérios de Aceite
- [ ] A API (`api/`) deve expor uma rota `POST /users` que aceita um payload compatível com `CreateUserSchema`.
- [ ] O payload deve ser validado via middleware do Hono usando o `CreateUserSchema` exportado de `shared`.
- [ ] Se a validação falhar, retornar `400 Bad Request` com a listagem dos erros capturados pelo Zod.
- [ ] Se a validação passar, o usuário deve ser inserido no banco (via D1).
- [ ] O Frontend (`front/`) deve possuir um formulário para criação de usuário usando React Hook Form e `@hookform/resolvers/zod` com `CreateUserSchema`.

## Fora de Escopo
- Reset de senha.
- Login (Autenticação será feita em outra spec).

## Notas para o Agente
- Ao implementar no backend, lembre de referenciar o skill do `.agents/hono/SKILL.md` para as melhores práticas de roteamento.
- Ao implementar o frontend, lembre que o Next.js 16/React 19 tem convenções específicas e você deve sempre seguir o `.agents` do front.
- NUNCA crie novos tipos locais de `User` — use sempre os exportados do workspace `shared`.
