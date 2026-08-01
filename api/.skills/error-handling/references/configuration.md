# Configuration

Setup inicial para usar Either customizado com Hono em Cloudflare Workers.

---

## Either Customizado

Não utiliza `fp-ts`, `Effect` ou nenhuma lib externa. Implementação própria:

```ts
// src/core/either.ts

export class Left<L, R> {
  readonly value: L;

  constructor(value: L) {
    this.value = value;
  }

  isRight(): this is Right<L, R> {
    return false;
  }

  isLeft(): this is Left<L, R> {
    return true;
  }
}

export class Right<L, R> {
  readonly value: R;

  constructor(value: R) {
    this.value = value;
  }

  isRight(): this is Right<L, R> {
    return true;
  }

  isLeft(): this is Left<L, R> {
    return false;
  }
}

export type Either<L, R> = Left<L, R> | Right<L, R>;

export const left = <L, R>(value: L): Either<L, R> => new Left(value);
export const right = <L, R>(value: R): Either<L, R> => new Right(value);
```

---

## Erros de Domínio

Crie classes de erro por caso de uso:

```ts
// src/core/errors/resource-not-found-error.ts
export class ResourceNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}
```

---

## Setup do Hono

```ts
// src/app.ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
```

---

## Zod — parse vs safeParse

> ⚠️ **Seção em aberto:** A estratégia definitiva entre `parse` e `safeParse` não foi definida.

**Opção A — `parse` (throw automático)**

```ts
// Lança ZodError automaticamente → capturado pelo app.onError()
const body = schema.parse(await c.req.json());
```

**Opção B — `safeParse` (controle manual)**

```ts
// Retorna { success, data, error } → você decide o que fazer
const result = schema.safeParse(await c.req.json());

if (!result.success) {
  throw new HTTPException(422, { message: result.error.message });
}
```

Escolha uma estratégia e documente aqui.
