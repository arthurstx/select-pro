# SPEC — Dashboard de Inscrições

ID: FEAT-0007
Módulo: Operação do processo seletivo — visão das inscrições
Versão: 1.3
Data: 2026-08-21
Status: DRAFT

> **v1.3 (2026-08-21):** acrescenta `sort` em `GET /dashboard/candidates` — `recent` (default) ou `oldest`, para o cabeçalho clicável da coluna "Inscrição" na UI (ver `0007-candidate-dashboard-ui.md`, v1.3). Observação do time. Entra na chave de cache junto dos demais parâmetros (seção 9), pelo mesmo motivo de `page`/`search`/`from`/`to`: sem isso, o segundo sort serviria a página em cache do primeiro.
>
> **v1.2 (2026-08-21):** acrescenta `byDay` em `GET /dashboard/metrics` — inscritos por dia, para o gráfico de linha da UI (ver `0007-candidate-dashboard-ui.md`, v1.1). Observação do time: os dois gráficos demográficos (gênero, etnia) viram pizza na UI, e o dado de origem não muda; a única mudança de contrato é `byDay`.
>
> **v1.1 (2026-08-20):** acrescenta `GET /dashboard/editions`. Lacuna encontrada na implementação: as três rotas originais apenas CONSOMEM `process_id`, e nenhuma o enumera — o front sabia qual era a edição corrente (vem em `scope.process`) mas não tinha o uuid da anterior para montar o seletor. Alternativas descartadas: embutir o catálogo em `metrics` (mistura catálogo com agregado, e a lista viajaria de novo a cada troca de filtro) e aceitar `label` além de `uuid` (duplicaria a regra de calendário no cliente, e faria aparecer no seletor edições que nunca existiram).

> **Contexto:** o `/painel` é um placeholder desde a FEAT-0003 — um card com os dados da própria sessão e um botão de sair. Não há nenhuma visão de quem está se inscrevendo: para saber quantos são, de quais cursos, ou ler o que uma pessoa escreveu no questionário, é preciso consultar o D1 à mão.
>
> Esta é a **primeira feature em que o papel do usuário muda a resposta da API**, e não apenas o acesso a ela. A FEAT-0005 criou o `requireRole` e registrou que ele ainda não barrava ninguém; aqui ele barra — e mais que isso, o mesmo endpoint devolve corpos diferentes para `admin` e para `avaliador`.
>
> **Esta spec é sobre inscrição, não sobre presença.** O check-in tem tela própria (FEAT-0005) e fica fora daqui. Isso não é economia de escopo: incluir presença traria o problema de somar percentuais entre edições, que não fecha — 61% de qual total, se cada edição tem o seu?

---

## 1. Objetivo

Dar a quem opera o processo seletivo três coisas que hoje só existem no banco: **quantos** se inscreveram e com que perfil, **quem** são, e **o que** cada um escreveu no questionário.

O recorte padrão é a edição corrente, mas a tela permite olhar uma edição anterior ou todas somadas — e, em visão histórica, comparar edições lado a lado. A tabela de candidatos é filtrável por nome e por intervalo de data de inscrição.

Métricas demográficas (gênero e etnia) são **exclusivas de `admin`**, e a restrição vive no backend: o corpo da resposta muda conforme o papel.

**Fora do escopo desta spec:** presença/check-in, avaliação do candidato, edição da inscrição, e qualquer noção de "fase" ou "aprovação" do candidato (ver seção 7).

---

## 2. Atores

- **Ator primário:** `admin` — vê tudo, incluindo demografia.
- **Ator secundário:** `avaliador` — vê os mesmos números operacionais e os textos do questionário, **sem** gênero e etnia.

**Restrição:** o candidato não tem login e nunca acessa esta tela. Ela lê dados de terceiros — é a tela com o dado mais sensível do produto até aqui.

---

## 3. User Story

```gherkin
Como membro da diretoria,
Eu quero ver quantas pessoas se inscreveram e com que perfil,
Para eu poder avaliar o alcance da divulgação e planejar a dinâmica.
```

```gherkin
Como avaliador,
Eu quero abrir um candidato e ler o que ele escreveu na inscrição,
Para eu poder me preparar antes de avaliá-lo.
```

---

## 4. Fluxo Principal (Happy Path)

As quatro rotas vivem sob o prefixo **`/dashboard`**, autenticado, com `requireAuth` seguido de `requireRole(ADMIN, AVALIADOR)`.

### 4.1 Recorte de edição

Todas as rotas aceitam `process_id`:

| Valor | Significado |
| --- | --- |
| ausente | Edição corrente, resolvida por `SelectionProcessRepository.resolveCurrent()` |
| um uuid | Aquela edição |
| `all` | Todas as edições |

> **`all` é um valor de domínio, não um `process_id` vazio.** Deixar o parâmetro ausente significar "corrente" e a string `all` significar "todas" evita o terceiro estado ambíguo em que o cliente manda `process_id=` e ninguém sabe o que ele quis dizer.

### 4.2 Métricas — `GET /dashboard/metrics`

1. Sistema resolve o recorte (4.1).
2. Sistema agrega, na mesma requisição: total de inscritos, cursos distintos, quantos declararam necessidade especial, quantos têm restrição de sábado, e as distribuições por curso, semestre e origem da divulgação.
3. **Se o papel for `admin`**, acrescenta as distribuições por gênero e por etnia.
4. Sistema retorna `200 OK`.

Com `mode=by_edition`, cada distribuição vem quebrada por edição em vez de somada — é o que alimenta a comparação da UI. Só faz sentido com `process_id=all`; com uma edição só, `sum` e `by_edition` produzem o mesmo resultado e o parâmetro é ignorado.

### 4.3 Listagem — `GET /dashboard/candidates`

1. Sistema resolve o recorte (4.1).
2. Aplica os filtros: `search` (parcial, case-insensitive, sobre `name`), `from` e `to` (intervalo sobre `created_at`).
3. Ordena por `created_at DESC, id ASC` — inscrição mais recente primeiro, que é o que interessa numa tela de acompanhamento.
4. Aplica `LIMIT`/`OFFSET` e retorna a página com os metadados de paginação.

> **A ordenação é o inverso da do check-in.** Lá é `created_at ASC` (a fila de quem chegou); aqui é `DESC` (o que aconteceu por último). Mesma coluna, perguntas opostas.

### 4.4 Detalhe — `GET /dashboard/candidates/{id}`

1. Sistema busca o candidato **e** sua inscrição (`candidate_applications`).
2. Candidato inexistente ⇒ E1.
3. **Se o papel for `admin`**, o corpo inclui gênero e etnia; caso contrário, não.
4. Sistema retorna `200 OK` com contato, dados acadêmicos, respostas do questionário e os dois textos livres.

> **O detalhe não é filtrado por edição.** Um id identifica uma inscrição específica, e a edição dela vem no corpo — abrir o detalhe de alguém de 2026.1 enquanto a tela mostra 2026.2 é legítimo, e acontece na visão "todas as edições".

### 4.5 Catálogo de edições — `GET /dashboard/editions` (v1.1)

1. Sistema resolve a edição corrente, **criando-a se faltar** (FEAT-0005, seção 4.1.1).
2. Sistema lista todas as edições, da mais recente para a mais antiga.
3. Sistema retorna `200 OK` com a lista e a corrente.

> **A ordem dos dois passos importa.** Resolver a corrente ANTES de listar é o que garante que ela apareça no seletor: na ordem inversa, o primeiro acesso de cada semestre devolveria um catálogo sem a edição em curso.
>
> Ordena por `starts_at DESC`, não por `label`. A ordenação alfabética de `2026.1`/`2026.2` coincide com a cronológica hoje, mas é coincidência do formato — não garantia.

---

## 5. Fluxos Alternativos e Erros

| #   | Cenário                                | Condição                                                              | Ação                                              | Código HTTP        |
| --- | -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | ------------------ |
| E1  | Candidato inexistente                  | `id` não corresponde a nenhuma linha de `candidates`                  | bloquear                                          | `404 Not Found`    |
| E2  | Edição corrente indeterminável         | a resolução falhou (guarda de invariante, ver FEAT-0005 §4.1.1)       | bloquear                                          | `409 Conflict`     |
| E3  | `process_id` inexistente               | uuid que não corresponde a nenhuma edição                             | bloquear                                          | `404 Not Found`    |
| E4  | Intervalo de data invertido            | `from` posterior a `to`                                               | bloquear, apontando o campo                       | `400 Bad Request`  |
| E5  | Paginação inválida                     | `page < 1`, `per_page` fora de 1–100, ou valor não numérico            | bloquear, apontando o campo                       | `400 Bad Request`  |
| E6  | Sem credencial válida                  | header ausente, token inválido ou expirado                             | negar (herdado de `requireAuth`)                  | `401 Unauthorized` |
| E7  | Papel não autorizado                   | `role` fora do conjunto da rota                                        | negar                                             | `403 Forbidden`    |
| E8  | Filtro de data fora da janela da edição | intervalo válido, mas sem interseção com a edição escolhida            | **não é erro** — lista vazia, `total: 0`          | `200 OK`           |
| E9  | Modo de manutenção                     | `MAINTENANCE_MODE === "true"`                                          | responder sem tocar no banco                      | `503 Service Unavailable` |

> **E8 não é erro, e é o cenário mais fácil de confundir com um.** Edição e intervalo de data são dois recortes temporais sobrepostos: escolher `2026.1` (janeiro a julho) com um intervalo de agosto devolve vazio legitimamente. O backend responde `200` com lista vazia; cabe à UI explicar por quê, em vez de mostrar uma tabela vazia sem motivo (FEAT-0007-UI, seção 5).
>
> **Nenhum código de erro novo é necessário.** E1 reusa `CANDIDATE_NOT_FOUND`, E2 reusa `NO_ACTIVE_SELECTION_PROCESS` (ambos de `CheckinErrorCode`), E7 reusa `INSUFFICIENT_ROLE` (`AuthErrorCode`), E4/E5 caem no `validationHook` genérico com `field`. Só E3 precisa de código próprio: `SELECTION_PROCESS_NOT_FOUND`.

---

## 6. Critérios de Aceite

- [ ] **Um token de `avaliador` recebe uma resposta SEM gênero e SEM etnia** em `/dashboard/metrics` e no detalhe — verificado no corpo da resposta, não na tela
- [ ] Um token de `admin` recebe os dois blocos
- [ ] A soma das distribuições (curso, semestre, gênero) é igual ao total de inscritos do mesmo recorte
- [ ] `process_id=all` devolve o histórico; ausente devolve a edição corrente; um uuid devolve aquela edição
- [ ] `mode=by_edition` quebra as distribuições por edição; com uma edição só, é equivalente a `sum`
- [ ] Etnia é devolvida apenas no total geral, **nunca** cruzada com curso ou semestre
- [ ] A listagem filtra por `search`, `from` e `to` na mesma consulta, e `total` reflete o conjunto filtrado
- [ ] Intervalo sem interseção com a edição devolve `200` com lista vazia, não erro
- [ ] `from` posterior a `to` devolve `400` apontando o campo
- [ ] A listagem ordena da inscrição mais recente para a mais antiga
- [ ] O detalhe devolve os dois textos livres na íntegra, sem truncar
- [ ] Nenhum tipo de request/response é declarado fora de `shared/src/schemas`

---

## 7. Fora de Escopo

- **Presença/check-in.** Tem tela e API próprias (FEAT-0005). Trazer para cá exigiria decidir o que "84 presentes (61%)" significa somando edições com totais diferentes — e a resposta honesta é que não significa nada.
- **Fases, homologação e aprovação do candidato.** Não existe máquina de estados de candidato no schema, e nada nesta spec cria uma. Os mockups do Stitch sugeriram isso mais de uma vez (`Em Análise`, `Aprovados (1ª Fase)`, `Homologados`, botão "Avançar Fase"); é invenção da ferramenta, não requisito.
- **Edição da inscrição.** A FEAT-0001 §7 já colocou fora de escopo: o candidato não volta atrás, e correções passam por quem administra o banco. O painel de detalhe é **somente leitura**.
- **Exportação (CSV/planilha).** A sincronização com o Google Sheets (FEAT-0002) já cobre o caso de quem precisa dos dados fora do sistema.
- **Comparação de mais de duas edições** no modo `by_edition`. A regra de calendário produz duas por ano; a UI fica ilegível bem antes de isso virar problema, e resolver antes da hora é adivinhar.

---

## 8. Dados e Modelos

### 8.1 Origem dos dados

Nenhuma tabela nova. Tudo sai de `candidates` e `candidate_applications`:

```ts
// De `candidates`: process_id, course, semester, gender, ethnicity,
//                  name, email, phone, created_at
// De `candidate_applications`: referral_source, referral_source_other,
//                  experience, motivation, saturday_restriction, special_needs
```

**Pontos de atenção para quem for implementar:**

- **`candidates` não é alterada.** Esta feature é só leitura — nenhuma migration.
- **O filtro de data é consulta indexada.** `idx_candidates_created_at` nasceu na `0006` e sobreviveu à reconstrução da `0007` (foi um dos passos que o padrão da `0004` não tinha). Filtrar por intervalo não é varredura.
- **O `process_id` já está gravado** desde a FEAT-0006 — o recorte por edição é `WHERE process_id = ?`, não inferência por janela de data. A dívida que a FEAT-0005 assumiu foi paga.
- **As agregações são múltiplos `GROUP BY` sobre a mesma base.** Com centenas de linhas cabe numa requisição; o custo é I/O, que não conta contra o teto de 10 ms de CPU do plano Free.
- **`experience` tem até 1000 caracteres e `motivation` até 500.** Eles saem **apenas** no detalhe, nunca na listagem — carregá-los em cada página seria multiplicar o payload por nada.

### 8.2 Query Params

**`GET /dashboard/metrics`**

| Param        | Default    | Regra |
| ------------ | ---------- | ----- |
| `process_id` | corrente   | uuid ou `all` |
| `mode`       | `sum`      | `sum` \| `by_edition` |

**`GET /dashboard/candidates`**

| Param        | Default  | Regra |
| ------------ | -------- | ----- |
| `process_id` | corrente | uuid ou `all` |
| `page`       | `1`      | inteiro ≥ 1 |
| `per_page`   | `25`     | inteiro entre 1 e 100 |
| `search`     | —        | parcial, case-insensitive, sobre `name` |
| `from`       | —        | data (`YYYY-MM-DD`), inclusive |
| `to`         | —        | data (`YYYY-MM-DD`), inclusive |
| `sort`       | `recent` | `recent` \| `oldest` (v1.3) |

> `from`/`to` são **datas**, não timestamps. `to` é inclusive até o fim do dia — senão filtrar "de 12/08 a 12/08" não devolveria nada, que é o oposto do que a pessoa quis dizer.
>
> **`sort` (v1.3) ordena por `createdAt`, a mesma coluna do `from`/`to`.** `recent` é o comportamento de sempre — mais nova primeiro; `oldest` inverte. Não interage com busca nem com o intervalo de data: são filtros diferentes de uma mesma consulta, e a paginação preserva a ordem escolhida entre páginas.

### 8.3 Response — Sucesso

**`GET /dashboard/metrics` (`200 OK`)**

```json
{
  "data": {
    "scope": { "kind": "edition", "process": { "id": "uuid", "label": "2026.2" } },
    "totals": {
      "candidates": 137,
      "coursesRepresented": 8,
      "coursesTotal": 8,
      "specialNeeds": 12,
      "saturdayRestriction": 45
    },
    "byCourse":   [{ "key": "eng-computacao", "count": 25 }],
    "bySemester": [{ "key": 4, "count": 31 }],
    "byReferralSource": [{ "key": "instagram", "count": 62 }],
    "byDay": [
      { "key": "2026-08-01", "count": 4 },
      { "key": "2026-08-02", "count": 0 },
      { "key": "2026-08-03", "count": 7 }
    ],
    "byGender":    [{ "key": "feminino", "count": 58 }],
    "byEthnicity": [{ "key": "parda", "count": 49 }]
  }
}
```

> **`byGender` e `byEthnicity` são OPCIONAIS no schema** e simplesmente não vêm quando o papel é `avaliador`. Não vêm vazios, não vêm nulos: **ausentes**. Um array vazio diria "não há dado", que é diferente de "você não pode ver" — e faria a UI desenhar um gráfico zerado.
>
> **As chaves são os slugs, não os rótulos.** `eng-computacao`, não "Engenharia de Computação". Os mapas de rótulo (`COURSE_LABELS`, `GENDER_LABELS`, `ETHNICITY_LABELS`, `REFERRAL_SOURCE_LABELS`) já existem em `shared` e são aplicados na exibição — devolver rótulo pela API duplicaria a tradução e quebraria a ordenação estável das séries.
>
> Com `scope.kind = "all"`, `scope.process` é omitido e cada item das distribuições ganha `byEdition` quando `mode=by_edition`.
>
> **`byDay` (v1.2) é diferente das outras quatro distribuições em dois pontos.** Primeiro, `key` é uma data (`AAAA-MM-DD`), não um slug de domínio, e não é traduzida por nenhum `_LABELS` — a UI só formata a data. Segundo, e mais importante: **os dias sem inscrição entram com `count: 0`**, ao contrário de `byCourse`/`byGender`/etc., que simplesmente omitem uma chave sem dado. O motivo é o consumidor: um gráfico de linha com um buraco no meio lê como falha de leitura, não como "zero inscrições nesse dia" — um gráfico de barra ou pizza não tem esse problema, porque a ausência de uma fatia/barra já é visualmente um zero. O intervalo preenchido vai do primeiro ao último dia com QUALQUER inscrição no recorte, nunca até "hoje": numa edição encerrada isso estenderia a linha com uma cauda de zeros sem significado. É por isso, também, que `byDay` não é `.optional()` como `byGender`/`byEthnicity`: data de inscrição não é dado demográfico, e vale para os dois papéis.
>
> Em `mode=by_edition`, cada item de `byDay` ganha `byEdition` como as demais — mas TODAS as edições do comparativo aparecem em TODO dia do intervalo, com `count: 0` para quem não teve inscrição naquele dia. É a mesma lógica do zero-preenchimento aplicada por edição: numa linha por edição, uma edição ausente naquele ponto quebraria o traçado dela, e não existe "barra ausente" para disfarçar isso.

**`GET /dashboard/candidates` (`200 OK`)**

```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "string",
        "email": "string",
        "phone": "+5571988887777",
        "course": "eng-mecanica",
        "semester": 4,
        "createdAt": "timestamp",
        "process": { "id": "uuid", "label": "2026.2" }
      }
    ],
    "pagination": { "page": 1, "perPage": 25, "total": 137, "totalPages": 6 }
  }
}
```

> `process` vem em cada item, não só no topo: em `process_id=all` a mesma pessoa aparece em edições diferentes, e sem isso as duas linhas seriam indistinguíveis. É a recandidatura que a FEAT-0006 destravou.
>
> **A listagem não traz gênero nem etnia**, para nenhum papel. Demografia existe aqui como estatística agregada, não como coluna de tabela.

**`GET /dashboard/candidates/{id}` (`200 OK`)**

```json
{
  "data": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "phone": "+5571988887777",
    "course": "eng-mecanica",
    "semester": 4,
    "createdAt": "timestamp",
    "process": { "id": "uuid", "label": "2026.2" },
    "application": {
      "referralSource": "outros",
      "referralSourceOther": "Feira de profissões da escola",
      "experience": "string (até 1000 caracteres)",
      "motivation": "string (até 500 caracteres)",
      "saturdayRestriction": false,
      "specialNeeds": false
    },
    "demographics": { "gender": "feminino", "ethnicity": "parda" }
  }
}
```

> `demographics` segue a mesma regra de `byGender`/`byEthnicity`: **ausente** para `avaliador`, presente para `admin`.

**`GET /dashboard/editions` (`200 OK`)** — v1.1

```json
{
  "data": {
    "editions": [
      { "id": "uuid", "label": "2026.2" },
      { "id": "uuid", "label": "2026.1" }
    ],
    "current": { "id": "uuid", "label": "2026.2" }
  }
}
```

> `current` vem separado além de estar em `editions`: o seletor precisa marcar qual é a corrente, e derivar isso por data no cliente reintroduziria a regra de calendário que a rota existe para evitar.
>
> Mesmo corpo para os dois papéis — a edição não é dado demográfico.

### 8.4 Response — Erros

Envelope de `shared/src/schemas/error.schema.ts`.

| `code`                        | Cenário | HTTP |
| ----------------------------- | ------- | ---- |
| `CANDIDATE_NOT_FOUND`         | E1      | 404  |
| `NO_ACTIVE_SELECTION_PROCESS` | E2      | 409  |
| `SELECTION_PROCESS_NOT_FOUND` | E3      | 404  |
| `INSUFFICIENT_ROLE`           | E7      | 403  |

> Só `SELECTION_PROCESS_NOT_FOUND` é novo, e ele pertence ao domínio de processo seletivo — mora em `CheckinErrorCode` junto de `NO_ACTIVE_SELECTION_PROCESS`, apesar do nome do enum. Se um dia esse enum for renomeado para algo mais amplo, é o momento; criar um enum novo com dois códigos seria pior.

---

## 9. Requisitos Técnicos Definidos

| Requisito | Decisão | Justificativa |
| --- | --- | --- |
| Corte por papel | No **service**, montando corpos diferentes — não no front | Esconder o gráfico no cliente enquanto a API entrega o dado a qualquer avaliador não é privacidade, é maquiagem. É a primeira rota do projeto em que o papel muda a resposta, e não só o acesso |
| Campos restritos | **Ausentes**, não vazios nem nulos | Array vazio significa "não há dado"; ausência significa "não é para você". A UI reage à presença da chave, sem precisar conhecer papéis |
| Etnia | Só no total geral, nunca cruzada com curso/semestre | Em turma pequena o cruzamento reidentifica pessoa; o agregado, não |
| Prefixo | `/dashboard`, com CORS de allowlist e `maintenanceGuard`, como `/candidates` | Prefixo novo não herda middleware nenhum — a FEAT-0002 E7 existe porque o cron escapou do guard |
| Cache | KV com **TTL de 60 s, sem invalidação por geração** | Um dashboard 60 s desatualizado é aceitável; uma lista de presença não era. Invalidar por geração acoplaria `CandidateService.register` ao dashboard, e o ganho não paga o acoplamento |
| Chave de cache | Inclui papel, recorte, modo e todos os filtros | Sem o **papel** na chave, um avaliador poderia receber a resposta cacheada de um admin — com demografia. É o erro mais perigoso possível nesta feature |
| Textos longos | Só no detalhe, nunca na listagem | 1500 caracteres × 25 linhas por página, para nada |
| Ordenação | `created_at DESC, id ASC` | Tela de acompanhamento mostra o que aconteceu por último. O `id` desempata para a paginação não repetir linha |
| Camadas | `dashboard.routes.ts` / `dashboard.service.ts` / `dashboard.repository.ts` | `api/.agents/architecture/SKILL.md` |

---

## 10. Perguntas Esclarecidas / Em Aberto

| #   | Pergunta | Resposta | Decidido em |
| --- | -------- | -------- | ----------- |
| 1   | A tela mostra métricas, lista, ou os dois? | **Os dois**, mais um painel de detalhe ao clicar na linha | 2026-08-19 |
| 2   | Quem acessa? | `admin` e `avaliador`, com **corpos diferentes**: demografia só para admin | 2026-08-19 |
| 3   | Recorte temporal? | Edição corrente por padrão, com seletor para anterior ou todas | 2026-08-19 |
| 4   | "Todas as edições" soma ou compara? | **Soma por padrão**, com alternância para comparativo (`mode=by_edition`) | 2026-08-19 |
| 5   | Presença entra? | **Não.** É de outra tela, e o percentual não soma entre edições | 2026-08-19 |
| 6   | Quais filtros na tabela? | Busca por nome e intervalo de data de inscrição. Sem filtro de curso/semestre nesta versão | 2026-08-19 |
| 7   | O cache precisa invalidar a cada inscrição? | **Não.** TTL de 60 s basta — ver seção 9 | 2026-08-19 |
| 8   | Etnia deveria ser cruzável com curso? | **Não**, e a decisão é de privacidade, não de esforço. Revisitar exigiria justificar por que o risco de reidentificação é aceitável | 2026-08-19 |
| 9   | Um `avaliador` deveria ver os textos do questionário? | **Sim.** Ler experiência e motivação é o trabalho dele; a restrição é demográfica, não de conteúdo da inscrição | 2026-08-19 |

---

## 11. Dependências Externas

- **Nenhuma.** Só D1, o `JWT_SECRET` já existente e o KV `CANDIDATES_KV` já criado na FEAT-0005.

**Limites do plano Free relevantes:**

| Recurso | Limite | Impacto aqui |
| --- | --- | --- |
| CPU por invocação | 10 ms | Irrelevante: agregação é I/O do D1, que não conta |
| Leitura no D1 | 5.000.000 linhas/dia | É a métrica que esta feature consome. As agregações varrem a base a cada cache-miss — daí o TTL |
| Escrita no D1 | 100.000 linhas/dia | Não se aplica: a feature é somente leitura |

---

## 12. Métricas de Sucesso

> Sugestões para discutir com o time:
>
> - Nenhuma consulta manual ao D1 para responder "quantos inscritos temos?" — é o problema que motivou a feature
> - Proporção de acessos ao detalhe sobre acessos à tela: mede se ler o questionário é uso real ou hipótese nossa
> - Origem de divulgação com maior crescimento entre edições, uma vez que o comparativo exista

---

## 13. Notas e Observações

- **Esta é a primeira vez que o papel muda o CORPO da resposta.** Até aqui, autorização no projeto era binária: ou a rota responde, ou devolve 403. Aqui o mesmo endpoint devolve mais ou menos dado conforme quem pergunta. A consequência prática é que **o papel precisa entrar na chave do cache** — sem isso, um avaliador pode receber a resposta cacheada de um admin, com demografia junto. É o bug mais perigoso que esta feature pode ter, e o mais silencioso.
- **Campo ausente ≠ campo vazio.** A escolha de omitir `byGender`/`byEthnicity` em vez de mandar array vazio faz a UI reagir à forma do payload, sem duplicar a regra de papéis no cliente. Se um dia a API mandar `[]` por engano, a tela desenha um gráfico zerado e ninguém percebe que a restrição quebrou.
- **Edição e intervalo de data se sobrepõem, e isso é aceito.** Escolher `2026.1` com datas de agosto devolve vazio — corretamente. Não vale bloquear a combinação: a pessoa pode estar explorando, e um `400` seria mais confuso que uma lista vazia bem explicada.
- **Os mockups sugeriram três vezes um sistema de fases** (`Avançar Fase`, depois `Em Análise`/`Aprovados (1ª Fase)`, depois `Homologados`). Nada disso existe no schema, e esta spec não cria. Registrado aqui porque a sugestão vai reaparecer — e porque implementar "fase" sem coluna de fase produz um botão que não faz nada.
- **A dívida da FEAT-0005 foi paga e esta spec colhe o benefício.** Lá, o vínculo candidato ↔ edição era inferido pela janela de datas, com a advertência de tratar as datas como imutáveis. Com `candidates.process_id` (FEAT-0006), o recorte aqui é um `WHERE` direto, e a advertência não se aplica mais.
