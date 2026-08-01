# Routing

Gotchas de roteamento que causam comportamentos silenciosos e difíceis de debugar.

## Prioridade de Rotas — Ordem de Registro

Rotas são avaliadas **na ordem em que foram registradas**. Quando um handler é executado, o processo para — rotas abaixo não são verificadas.

```ts
// ❌ Wildcard antes da rota específica — /foo nunca é alcançado
app.get('*', (c) => c.text('wildcard'))
app.get('/foo', (c) => c.text('foo')) // nunca executado

// ✅ Rota específica primeiro
app.get('/foo', (c) => c.text('foo'))
app.get('*', (c) => c.text('fallback'))
```

```ts
// ✅ Rota exata tem prioridade sobre parâmetro dinâmico (mesmo registrada depois)
app.get('/book/a', (c) => c.text('a'))       // GET /book/a → 'a'
app.get('/book/:slug', (c) => c.text('slug')) // GET /book/b → 'slug'
```

## Grouping Ordering — 404 Silencioso

**A armadilha mais comum ao escalar a aplicação.** `app.route()` captura as rotas do sub-app **no momento da chamada**. Se o sub-app ainda não tem rotas registradas quando `route()` é chamado, o resultado é 404.

```ts
// ❌ app.route() chamado antes das rotas de `two` existirem
three.get('/hi', (c) => c.text('hi'))
app.route('/two', two)   // two não tem rotas ainda
two.route('/three', three)

// GET /two/three/hi → 404

// ✅ Montar na ordem correta — filhos antes dos pais
three.get('/hi', (c) => c.text('hi'))
two.route('/three', three)  // three já tem rotas
app.route('/two', two)      // two já tem rotas

// GET /two/three/hi → 'hi'
```

## strict mode — Trailing Slash

Por padrão (`strict: true`), `/hello` e `/hello/` são rotas **diferentes**.

```ts
app.get('/hello', (c) => c.text('hello'))
// GET /hello   → 200
// GET /hello/  → 404

// Para tratar ambos como iguais:
const app = new Hono({ strict: false })
```

## HEAD Requests — app.head() Não Funciona

Hono converte HEAD → GET **antes** do roteamento, no nível do dispatch. Qualquer `app.head()` registrado nunca é chamado.

```ts
// ❌ Este handler nunca é executado
app.head('/api/users', (c) => {
  c.header('X-Custom', 'value')
  return c.text('')
})

// ✅ Usar GET — HEAD herda headers e status automaticamente (sem body)
app.get('/api/users', async (c) => {
  const users = await getUsers()
  c.header('X-Total-Count', String(users.length))
  return c.json(users) // HEAD retorna só os headers, sem o body
})

// ✅ Para lógica específica de HEAD, usar middleware
app.use('/api/resource', async (c, next) => {
  await next()
  if (c.req.method === 'HEAD') {
    c.res = new Response(null, c.res) // força body nulo
  }
})
```

## Roteamento por Hostname

Para rotear por hostname (multi-tenant, multi-domínio):

```ts
// Por URL completa
const app = new Hono({
  getPath: (req) => req.url.replace(/^https?:\/([^?]+).*$/, '$1'),
})
app.get('/www1.example.com/hello', (c) => c.text('www1'))
app.get('/www2.example.com/hello', (c) => c.text('www2'))

// Por header Host (mais comum em Workers — a URL pode ser interna)
const app = new Hono({
  getPath: (req) =>
    '/' + req.headers.get('host') + req.url.replace(/^https?:\/\/[^/]+(\/[^?]*).*/, '$1'),
})
```

## basePath — Montagem com Prefixo

```ts
// Opção 1: basePath no construtor
const api = new Hono().basePath('/api')
api.get('/users', (c) => c.json([])) // GET /api/users

// Opção 2: route() com prefixo (mais comum para sub-apps em arquivos separados)
const users = new Hono()
users.get('/', (c) => c.json([]))    // internamente é GET /
users.get('/:id', (c) => c.json({})) // internamente é GET /:id

const app = new Hono()
app.route('/api/users', users)
// GET /api/users     → users handler GET /
// GET /api/users/123 → users handler GET /:id
```

## notFound — Só Funciona no App de Topo

`app.notFound()` registrado em sub-apps **não é chamado**. Apenas o `notFound` do app principal funciona.

```ts
// ❌ Não funciona — notFound em sub-app é ignorado
const users = new Hono()
users.notFound((c) => c.json({ error: 'not found' }, 404)) // nunca chamado

// ✅ Registrar apenas no app principal
const app = new Hono()
app.route('/users', users)
app.notFound((c) => c.json({ error: 'not found' }, 404)) // funciona
```

## onError — Prioridade Route-level

Se tanto o app principal quanto rotas internas têm `onError`, o handler da **rota interna tem prioridade**.

```ts
const app = new Hono()

app.onError((err, c) => {
  return c.text('global error', 500)
})

const api = new Hono()
api.onError((err, c) => {
  return c.json({ error: err.message }, 500) // este vence para rotas em /api
})

app.route('/api', api)
```