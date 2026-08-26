# Quickstart: Validar o Filtro por Curso

## Pré-requisitos

- `npm install` na raiz do monorepo já rodado.
- `api/.dev.vars` presente (copiado do checkout principal), com
  `MEMBER_DIRECTORY_BYPASS=true` — sem isso, cadastro/login local bate no
  Supabase real.
- Banco D1 local com ao menos uma edição (`selection_processes`) e alguns
  candidatos (`candidates`) de cursos diferentes. Se vazio, usar o fluxo de
  inscrição (`POST /candidates`) ou o wizard do front para popular.

## Validar via API (sem abrir o browser)

```bash
# Na raiz do monorepo
npm run dev --workspace=api
```

Em outro terminal, com um token de admin/avaliador válido (`$TOKEN`):

```bash
# Check-in filtrado por curso
curl -s "http://localhost:8787/candidates?course=eng-computacao" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items[].course'
# Esperado: só "eng-computacao" nos itens retornados

# Combinando com status
curl -s "http://localhost:8787/candidates?course=eng-computacao&status=presentes" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.pagination'

# Curso inválido -> 400
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8787/candidates?course=medicina" \
  -H "Authorization: Bearer $TOKEN"
# Esperado: 400

# Dashboard filtrado por curso
curl -s "http://localhost:8787/dashboard/candidates?course=arquitetura&process_id=all" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items[].course'
# Esperado: só "arquitetura"

# Métricas do dashboard não têm (nem precisam de) o filtro de curso
curl -s "http://localhost:8787/dashboard/metrics" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.byCourse'
# Esperado: distribuição de TODOS os cursos, inalterada pelo filtro da listagem
```

## Validar no front (requer confirmação antes de abrir o Browser pane)

1. `npm run dev --workspace=front`
2. Acessar `/painel/check-in`, selecionar um curso no novo filtro, conferir
   que a lista e a contagem mudam e que o filtro de status continua
   funcionando junto.
3. Acessar `/painel` (dashboard), selecionar um curso no mesmo componente,
   conferir que só a tabela de inscritos muda — os gráficos permanecem
   iguais — e que trocar de página mantém o curso filtrado.

## Testes automatizados

```bash
npm run test --workspace=api
npx tsc --noEmit --project shared/tsconfig.json
npx tsc --noEmit --project api/tsconfig.json
npx tsc --noEmit --project front/tsconfig.json
npm run build --workspace=front
```

Critério de sucesso: suíte de testes passando, incluindo os novos casos de
`course` (válido, inválido, combinado com outros filtros) em
`checkin.service.test.ts`/`checkin.routes.test.ts` e
`dashboard.service.test.ts`/`dashboard.routes.test.ts`.
