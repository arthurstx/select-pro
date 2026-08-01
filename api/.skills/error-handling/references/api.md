# API Reference

---

## Either / Left / Right

Usado para **erros esperados** — resultados previstos do domínio.

### Assinatura

```ts
type Either<L, R> = Left<L, R> | Right<L, R>

left(value: L): Either<L, R>   // erro esperado
right(value: R): Either<L, R>  // sucesso
```

### Tipando um Use Case

```ts
type Response = Either<
  ResourceNotFoundError, // L — o que pode dar errado
  { post: Post } // R — o que retorna em sucesso
>;
```

### Verificando o resultado

```ts
// isLeft / isRight — type-safe
if (result.isLeft()) {
  // result.value é ResourceNotFoundError
}

if (result.isRight()) {
  // result.value é { post: Post }
}
```

> ⚠️ **Seção em aberto:** `map`, `flatMap` e composição de Either não foram definidos.
> Se necessário, documente aqui os helpers adotados.

---

## HTTPException (Hono)

Usado para **converter erros em respostas HTTP**. Sempre na camada de rota.

```ts
import { HTTPException } from "hono/http-exception";

throw new HTTPException(404, { message: "Post not found" });
throw new HTTPException(422, { message: "Invalid input" });
throw new HTTPException(500);
```

### Status Codes Comuns

| Situação               | Status |
| ---------------------- | ------ |
| Recurso não encontrado | 404    |
| Sem permissão          | 403    |
| Não autenticado        | 401    |
| Dados inválidos        | 422    |
| Erro interno           | 500    |

---

## app.onError()

Handler global para erros não capturados nas rotas.

```ts
app.onError((err, c) => {
  // HTTPException → retorna a resposta já formatada pelo Hono
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  // ZodError → se usar schema.parse() sem try/catch na rota
  if (err instanceof ZodError) {
    return c.json({ error: err.errors }, 422);
  }

  // Falhas técnicas → log + 500
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
```

### Responsabilidade do onError

| Tipo de erro           | Deve chegar aqui?                              |
| ---------------------- | ---------------------------------------------- |
| `HTTPException` (rota) | ✅ Sim, via throw na rota                      |
| Falha técnica (infra)  | ✅ Sim, se não capturada                       |
| `Either` left          | ❌ Não — convertido na rota antes              |
| ZodError               | Depende da estratégia (`parse` vs `safeParse`) |
