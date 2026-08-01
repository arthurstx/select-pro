# Validation

Gotchas de validação que causam falhas silenciosas (validador recebe `{}` em vez do body real).

## Content-Type Obrigatório para json e form

Sem o header `Content-Type` correto, o body não é parseado — o validador recebe `{}`.

```ts
// ❌ Validator recebe {} — sem Content-Type, body não é parseado
const res = await app.request("/api", {
  method: "POST",
  body: JSON.stringify({ name: "Test" }),
  // sem Content-Type
});

// ✅ Content-Type obrigatório
const res = await app.request("/api", {
  method: "POST",
  body: JSON.stringify({ name: "Test" }),
  headers: { "Content-Type": "application/json" },
});

// O mesmo vale para form:
const form = new FormData();
form.append("name", "Test");
const res = await app.request("/api", {
  method: "POST",
  body: form,
  // FormData define Content-Type automaticamente com boundary — ok neste caso
});
```

## Headers — Sempre Lowercase no Validador

O `validator('header', ...)` recebe os nomes de header em **lowercase**, independente de como foram enviados.

```ts
// ❌ Sempre undefined — header names no validador são lowercase
app.post(
  "/api",
  validator("header", (value, c) => {
    const key = value["Idempotency-Key"]; // undefined
    if (!key) return c.text("Missing header", 400);
    return { key };
  }),
  // ...
);

// ✅ Usar lowercase
app.post(
  "/api",
  validator("header", (value, c) => {
    const key = value["idempotency-key"]; // correto
    if (!key) return c.text("Missing header", 400);
    return { key };
  }),
  (c) => {
    const { key } = c.req.valid("header");
    return c.json({ key });
  },
);
```

## c.req.valid() — Só Funciona Após Validator

`c.req.valid('json')` só retorna o valor validado se um `validator('json', ...)` ou `zValidator('json', ...)` foi registrado como middleware **antes** do handler. Sem isso, lança erro em runtime.

```ts
// ❌ Sem validator antes do handler — c.req.valid() lança erro
app.post("/api", (c) => {
  const body = c.req.valid("json"); // runtime error
  return c.json(body);
});

// ✅ Validator antes do handler
app.post("/api", zValidator("json", z.object({ name: z.string() })), (c) => {
  const { name } = c.req.valid("json"); // tipado corretamente
  return c.json({ name });
});
```

## Alvos de Validação Disponíveis

| Alvo     | O que valida                | Observação                                                                       |
| -------- | --------------------------- | -------------------------------------------------------------------------------- |
| `json`   | Body JSON                   | Exige `Content-Type: application/json`                                           |
| `form`   | FormData ou urlencoded      | Exige `Content-Type: multipart/form-data` ou `application/x-www-form-urlencoded` |
| `query`  | Query string (`?key=value`) | Valores sempre chegam como `string`                                              |
| `param`  | Path parameters (`:id`)     | Valores sempre chegam como `string`                                              |
| `header` | Headers da requisição       | **Nomes sempre lowercase**                                                       |
| `cookie` | Cookies                     | —                                                                                |

## Múltiplos Validators na Mesma Rota

```ts
app.post(
  "/posts/:id",
  zValidator("param", z.object({ id: z.coerce.number() })),
  zValidator("query", z.object({ draft: z.coerce.boolean().optional() })),
  zValidator("json", z.object({ title: z.string(), body: z.string() })),
  (c) => {
    const { id } = c.req.valid("param"); // number (coerced)
    const { draft } = c.req.valid("query"); // boolean | undefined
    const { title } = c.req.valid("json"); // string
    return c.json({ id, draft, title });
  },
);
```

## Zod Validator com Callback de Erro Customizado

```ts
import { zValidator } from "@hono/zod-validator";

// Customizar resposta de erro de validação
const validate = (schema: z.ZodSchema) =>
  zValidator(schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Validation failed", issues: result.error.issues },
        422,
      );
    }
  });

app.post("/api", validate(z.object({ name: z.string() })), (c) => {
  const { name } = c.req.valid("json");
  return c.json({ name });
});
```
