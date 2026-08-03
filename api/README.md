```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## API Documentation (OpenAPI / Swagger)

Routes are defined with [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi), reusing the Zod contracts from the `shared` workspace (`request`/`response` schemas are never duplicated locally — see `api/.agents/validation/SKILL.md`).

With `npm run dev` running:

- **Swagger UI:** [http://localhost:8787/docs](http://localhost:8787/docs)
- **Raw OpenAPI 3.0 spec (JSON):** [http://localhost:8787/doc](http://localhost:8787/doc)

To add a new documented route, define it with `createRoute` (schemas imported from `shared`) and register it with `app.openapi(route, handler, hook)` instead of the plain `app.post/get/...`. See `src/routes/candidates.routes.ts` for a full example, including how per-route validation error mapping is preserved via the third `hook` argument.
