# Agent Context & Skills Index

Este projeto utiliza uma arquitetura modular de Skills para fornecer contexto específico e hiperfocado para agentes LLM.

> ⚠️ **REGRA DE LAZY LOADING (CRÍTICA)**
> 🚫 **NUNCA** leia todos os arquivos `.agents/**/*.md` de uma vez.
> ✅ **SEMPRE** consulte este índice primeiro, identifique qual domínio de conhecimento é necessário para a tarefa do usuário, e acesse **APENAS** o arquivo `SKILL.md` correspondente. Isso otimiza o uso de tokens e evita alucinações por sobreposição de contexto.

## Skills Disponíveis (`.agents/`)

| Skill              | Localização                       | Quando Usar (Triggers)                                                                                                                                                        |
| :----------------- | :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare**     | `.agents/cloudflare/SKILL.md`     | Quando interagir com bindings do Cloudflare Workers (`c.env`, KV, D1, R2, Queues), configurar o `wrangler.jsonc`, ou ao escrever testes locais com Miniflare/Vitest.          |
| **Hono**           | `.agents/hono/SKILL.md`           | Quando criar middlewares gerais, gerenciar o roteamento core, lidando com RPC, ou configurando event handlers (cron) no Hono + Workers. _(Nota: Não use para validação/Zod)._ |
| **Validation**     | `.agents/validation/SKILL.md`     | Quando o foco for tipagem de I/O, validação com Zod (body, params) ou geração de documentação OpenAPI/Swagger (`@hono/zod-openapi`).                                          |
| **Error Handling** | `.agents/error-handling/SKILL.md` | Quando houver dúvidas sobre o padrão de tratamento de erros (ex: quando retornar Either/Left/Right vs lançar HTTPException vs throw padrão).                                  |
| **Architecture**   | `.agents/architecture/SKILL.md`   | Sempre que for criar uma nova funcionalidade, para consultar em qual pasta os arquivos vão e como os services e repositórios recebem dependências.                            |

## Fluxo Recomendado de Consulta

1. Leia a tarefa do usuário e identifique as palavras-chave.
2. Verifique na tabela acima qual `SKILL.md` responde ao problema.
3. Leia o `SKILL.md` especificado (e se necessário, a pasta `references/` apontada por ele).
4. Aplique a diretriz ao código.
