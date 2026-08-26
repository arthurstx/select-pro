# Quickstart: validar a feature localmente

Pré-requisitos: `npm install` na raiz já feito; `api/.dev.vars` presente (copiado do checkout
principal, com `MEMBER_DIRECTORY_BYPASS=true` para não bater no Supabase real).

## 1. Aplicar a migration localmente

```sh
cd api
npx wrangler d1 execute select-pro --local --file migrations/0011-special-needs-description.sql
```

Antes de rodar, confira o estado da tabela (Princípio III — "o plano diz o que acontece com
os dados já gravados"):

```sh
npx wrangler d1 execute select-pro --local --command "SELECT sql FROM sqlite_master WHERE name = 'candidate_applications';"
```

Depois de aplicar, confirme a coluna nova e que linhas existentes vieram com `NULL`:

```sh
npx wrangler d1 execute select-pro --local --command "SELECT id, special_needs, special_needs_description FROM candidate_applications LIMIT 5;"
```

## 2. Rodar a suíte de testes da API

```sh
npm run test --workspace=api
```

Casos novos esperados (ver plan.md → Project Structure):
- `candidates.service.test.ts`: registro com `specialNeeds: true` sem descrição é rejeitado;
  com descrição é aceito e persiste `special_needs_description`; com `specialNeeds: false` a
  descrição enviada é ignorada (persiste `null`).
- `candidates.routes.test.ts`: `POST /candidate/register` retorna 400 quando `specialNeeds:
  true` e `specialNeedsDescription` ausente/vazio.
- `dashboard.service.test.ts` / `dashboard.routes.test.ts`: detalhe do candidato expõe
  `application.specialNeedsDescription`; totais agregados (`GET /dashboard/metrics`)
  continuam sem nenhum campo de texto.

## 3. Verificar tipos e build

```sh
npx tsc --noEmit --project shared/tsconfig.json
npx tsc --noEmit --project api/tsconfig.json
npx tsc --noEmit --project front/tsconfig.json
npm run build --workspace=front
```

## 4. Validar o fluxo end-to-end via curl (sem abrir o browser)

Com `wrangler dev` rodando localmente (`npm run dev --workspace=api`):

```sh
curl -s -X POST http://localhost:8787/candidate/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fulano de Tal",
    "email": "fulano.teste@example.com",
    "phone": "+5571988887777",
    "course": "eng-computacao",
    "semester": 3,
    "gender": "masculino",
    "referralSource": "instagram",
    "mejAcknowledged": true,
    "experience": "Já participei de projetos de extensão.",
    "motivation": "Quero aprender gestão de projetos reais.",
    "saturdayRestriction": false,
    "specialNeeds": true,
    "specialNeedsDescription": "Uso cadeira de rodas — preciso de acesso sem escadas.",
    "ethnicity": "nao-informado"
  }' | jq
```

Esperado: `201` com o `id` do candidato criado. Repetir sem `specialNeedsDescription` (mesmo
`specialNeeds: true`) deve retornar `400`.

Para conferir a exibição no detalhe (autenticado como avaliador/host/admin — token de
membro válido):

```sh
curl -s http://localhost:8787/dashboard/candidates/<id-retornado> \
  -H "Authorization: Bearer <token>" | jq '.data.application'
```

Esperado: `specialNeedsDescription` presente com o texto enviado.

## 5. Confirmar que o dado não vaza (User Story 3)

```sh
curl -s http://localhost:8787/dashboard/metrics -H "Authorization: Bearer <token>" \
  | jq '.data.totals' # só números, sem texto

curl -s http://localhost:8787/dashboard/candidates -H "Authorization: Bearer <token>" \
  | jq '.data.items[0]' # sem specialNeeds nem specialNeedsDescription

curl -s http://localhost:8787/candidates -H "Authorization: Bearer <token>" \
  | jq '.data.items[0]' # rota de check-in (checkinRouter) — idem, sem os campos
```

Verificação visual do formulário de inscrição e do painel de detalhe (textarea condicional,
mensagem de "não informado" para candidatos legados) fica pendente de abertura do Browser
pane — só deve ser feita mediante confirmação explícita do usuário, conforme regra do
ambiente desta sessão.
