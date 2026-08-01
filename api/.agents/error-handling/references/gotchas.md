# Gotchas

Erros comuns e o que evitar nesta stack.

---

## ❌ Não usar `throw` para resultados esperados

**Errado:**

```ts
if (!user) {
  throw new ResourceNotFoundError();
}
```

**Correto:**

```ts
if (!user) {
  return left(new ResourceNotFoundError());
}
```

**Por quê:** "Usuário não encontrado" é um resultado esperado da operação, não uma exceção. `throw` deve ser reservado para situações inesperadas.

---

## ❌ Não transformar falhas técnicas em Either

**Errado:**

```ts
type Response = Either<DatabaseError, User>;

// dentro do repository:
try {
  return right(await db.findUser(id));
} catch {
  return left(new DatabaseError());
}
```

**Correto:**

```ts
// Deixa o throw subir — é uma falha de infra, não um resultado de domínio
const user = await db.findUser(id); // se falhar, throw vai para o onError
```

**Por quê:** Erros de infra não fazem parte do contrato do domínio. O `app.onError()` cuida deles.

---

## ❌ Não retornar HTTPException do domínio ou serviço

**Errado:**

```ts
// dentro de um use case:
return left(new HTTPException(404));
```

**Correto:**

```ts
// Use case:
return left(new ResourceNotFoundError());

// Rota HTTP:
if (result.isLeft()) {
  throw new HTTPException(404, { message: "Not found" });
}
```

**Por quê:** `HTTPException` é do Hono — pertence à camada HTTP. O domínio não deve conhecer detalhes de transporte.

---

## ❌ Não ignorar o isLeft sem tratar

**Errado:**

```ts
const result = await useCase.execute({ id });
return c.json(result.value); // pode ser Left!
```

**Correto:**

```ts
const result = await useCase.execute({ id });

if (result.isLeft()) {
  throw new HTTPException(404);
}

return c.json(result.value);
```

---

## ❌ Não usar Either para erros de validação de entrada (Zod)

Validação de input (schema inválido) não é erro de domínio — é erro de contrato HTTP.

**Errado:**

```ts
type Response = Either<ZodError, { post: Post }>;
```

**Correto:**

```ts
// Zod valida antes de chegar no use case
// O use case recebe dados já válidos
const body = schema.parse(await c.req.json()); // ou safeParse → HTTPException 422
const result = await useCase.execute(body);
```

---

## ✅ Separação por Camada (Resumo)

| Camada             | Ferramenta      | Exemplo                                    |
| ------------------ | --------------- | ------------------------------------------ |
| Serviço / Use Case | `Either`        | `return left(new ResourceNotFoundError())` |
| Infraestrutura     | `throw`         | `throw new Error('KV unavailable')`        |
| Rota HTTP          | `HTTPException` | `throw new HTTPException(404)`             |
| Global             | `app.onError()` | Captura tudo que escapou                   |

---

## Limites do Cloudflare Workers

- **CPU time:** Workers têm limite de CPU. Evite try/catch desnecessários em loops críticos.
- **Sem processos longos:** Um erro não capturado em um Worker não derruba outros — cada request é isolado.
- **Logs:** `console.error()` aparece no Cloudflare Dashboard → sempre logue falhas técnicas antes de retornar 500.
