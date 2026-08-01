# Patterns

Exemplos completos de fluxo de erro por camada.

---

## Fluxo Completo: Buscar Post por ID

### Camada de Serviço / Use Case

```ts
// src/use-cases/get-post.ts
import { Either, left, right } from "@/core/either";
import { ResourceNotFoundError } from "@/core/errors/resource-not-found-error";
import { PostsRepository } from "@/repositories/posts-repository";
import { Post } from "@/entities/post";

type Request = { postId: string };

type Response = Either<ResourceNotFoundError, { post: Post }>;

export class GetPostUseCase {
  constructor(private postsRepository: PostsRepository) {}

  async execute({ postId }: Request): Promise<Response> {
    const post = await this.postsRepository.findById(postId);

    if (!post) {
      return left(new ResourceNotFoundError());
    }

    return right({ post });
  }
}
```

### Camada de Infraestrutura (Repository)

```ts
// src/repositories/cloudflare/kv-posts-repository.ts
export class KVPostsRepository implements PostsRepository {
  async findById(id: string): Promise<Post | null> {
    // Falha técnica → throw (não Either)
    const raw = await env.POSTS_KV.get(id);

    if (!raw) return null;

    return JSON.parse(raw) as Post;
  }
}
```

### Camada HTTP (Rota Hono)

```ts
// src/routes/posts.ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { GetPostUseCase } from "@/use-cases/get-post";

const posts = new Hono();

posts.get("/:id", async (c) => {
  const { id } = c.req.param();

  const useCase = new GetPostUseCase(/* repository */);
  const result = await useCase.execute({ postId: id });

  // Converte Either → HTTPException na borda HTTP
  if (result.isLeft()) {
    throw new HTTPException(404, { message: "Post not found" });
  }

  return c.json({ post: result.value.post });
});

export { posts };
```

---

## Fluxo: Falha Técnica (Fetch Externo)

```ts
// Não usa Either — deixa o throw subir para o app.onError()
posts.get("/:id/preview", async (c) => {
  const { id } = c.req.param();

  // Se falhar (timeout, DNS, conexão), throw sobe para onError → retorna 500
  const response = await fetch(`https://external-api.com/posts/${id}`);
  const data = await response.json();

  return c.json(data);
});
```

---

## Fluxo: Validação com Zod

### Usando `parse` (throw automático)

```ts
posts.post("/", async (c) => {
  // ZodError sobe para o app.onError() se falhar
  const body = createPostSchema.parse(await c.req.json());

  // continua com body validado...
});
```

### Usando `safeParse` (controle manual)

```ts
posts.post("/", async (c) => {
  const result = createPostSchema.safeParse(await c.req.json());

  if (!result.success) {
    throw new HTTPException(422, { message: result.error.message });
  }

  const body = result.data;
  // continua com body validado...
});
```

> ⚠️ Escolha uma estratégia e documente em `configuration.md`.

---

## Mapeando Erros de Domínio para Status HTTP

Se houver múltiplos tipos de erro de domínio, mapeie na rota:

```ts
import { ResourceNotFoundError } from "@/core/errors/resource-not-found-error";
import { UnauthorizedError } from "@/core/errors/unauthorized-error";

if (result.isLeft()) {
  const error = result.value;

  if (error instanceof ResourceNotFoundError) {
    throw new HTTPException(404, { message: error.message });
  }

  if (error instanceof UnauthorizedError) {
    throw new HTTPException(403, { message: error.message });
  }

  // fallback
  throw new HTTPException(500);
}
```
