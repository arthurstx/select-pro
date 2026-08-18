# SPEC — Unicidade por Edição e Normalização de Dados do Candidato

ID: FEAT-0006
Módulo: Inscrição de candidatos — integridade de dados
Versão: 1.0
Data: 2026-08-17
Status: DRAFT

> **Contexto:** três mudanças que a FEAT-0005 adiou deliberadamente, reunidas aqui porque **as três exigem a mesma coisa**: alterar constraints de `candidates`, o que no SQLite significa reconstruir a tabela inteira.
>
> 1. **Unicidade por edição** — hoje `email` e `phone` são `UNIQUE` globais, então quem se inscreveu em 2026.1 não consegue se inscrever em 2026.2.
> 2. **Telefone padronizado** — gravado hoje em qualquer formato que a regex permissiva aceite.
> 3. **Slugs de gênero por extenso** — `mascu` → `masculino`, `fem` → `feminino`.
>
> **Por que juntas:** reconstruir `candidates` é o procedimento mais perigoso deste banco — cinco tabelas filhas, quatro delas com `ON DELETE CASCADE`, e um `foreign_key_check` que volta limpo mesmo depois de o CASCADE ter apagado tudo (ver `0004-normalize-course-slugs.sql`). Cada execução é uma aposta. Fazer três apostas para resolver três problemas da mesma tabela é escolha ruim quando uma resolve os três.
>
> **Urgência:** os itens 1 e 2 **bloqueiam a abertura do segundo processo seletivo**. Não são melhorias.

---

## 1. Objetivo

Permitir que a mesma pessoa se inscreva em processos seletivos diferentes, garantir que todo telefone no banco esteja num formato único e comparável, e trocar os slugs abreviados de gênero por palavras inteiras — tudo numa única reconstrução de `candidates`.

A unicidade deixa de ser global e passa a ser **por edição**: `UNIQUE (process_id, email)` e `UNIQUE (process_id, phone)`. Isso preserva a proteção contra inscrição duplicada dentro do mesmo processo (que a FEAT-0001 depende) e remove a que bloqueava a recandidatura.

**Fora do escopo desta spec:** normalização de etnia, `member_profiles` (perfil do membro), e reescrita retroativa da planilha do Google Sheets (ver seção 7).

---

## 2. Atores

- **Ator primário:** candidato — afetado indiretamente; o que muda para ele é conseguir se inscrever de novo num processo novo, e ter o telefone gravado normalizado.
- **Ator secundário:** quem opera o banco — a migration não roda sozinha, e a seção 4.1 é dirigida a essa pessoa.

**Restrição:** esta feature não adiciona nenhuma rota nem nenhuma tela. É uma mudança de schema mais o ajuste do caminho de escrita que já existe.

---

## 3. User Story

```gherkin
Como candidato que participou do processo seletivo passado,
Eu quero me inscrever de novo na edição seguinte com o mesmo email,
Para eu poder concorrer sem precisar inventar um email novo.
```

```gherkin
Como avaliador,
Eu quero que os telefones apareçam todos no mesmo formato,
Para eu poder conferir o número que o candidato me fala sem traduzir máscara.
```

---

## 4. Fluxo Principal (Happy Path)

### 4.1 Pré-checagem — antes de escrever a migration

Três consultas cujo resultado precisa vir **vazio**, rodadas em staging **e** em produção. Se qualquer uma devolver linha, a correção é manual e vem antes de tudo:

1. **Telefones que não normalizam** — nenhum dos formatos reconhecidos (seção 8.2).
2. **Candidatos fora de toda janela de edição** — `created_at` que não cai em nenhuma linha de `selection_processes`. Quebrariam `process_id NOT NULL`.
3. **Colisões criadas pela normalização** — pares `(edição, telefone normalizado)` ou `(edição, email)` com mais de uma linha.

> **A terceira é a que ninguém descobre lendo o código, e é a mais perigosa.** Hoje `(71) 98888-7777` e `71988887777` são duas linhas distintas que passam pelo `UNIQUE`, porque a comparação é de string exata. Depois de normalizados, os dois viram `+5571988887777` e colidem — a migration falharia **no meio**, com a tabela já reconstruída. Ou seja: o `UNIQUE` de telefone que existe hoje já não garante o que promete, e essa spec é também o momento em que isso aparece.

### 4.2 Migration — `0007-candidate-edition-uniqueness.sql`

Segue o procedimento da `0004`, estendido para os **cinco** filhos atuais. Detalhado na seção 8.3.

### 4.3 Inscrição — `POST /candidate/register` (fluxo alterado)

1. Sistema valida o payload. **O telefone é normalizado para E.164 na própria validação** (seção 8.2), não no service.
2. Sistema resolve a **edição corrente** — mesma resolução sob demanda que o check-in usa (FEAT-0005, seção 4.1.1).
3. Sistema checa duplicidade de email e telefone **dentro daquela edição**, não globalmente.
4. Sistema grava candidato + inscrição no mesmo batch, agora com `process_id`.

> **A normalização entra no schema Zod, não no service.** Assim front e backend usam o mesmo código, sem regra duplicada — e como o E.164 resultante continua casando com a `PHONE_REGEX`, o transform é idempotente: o backend revalidar o que o front já normalizou não muda nada.

---

## 5. Fluxos Alternativos e Erros

As três primeiras linhas são **pré-condições da migration**, não erros de runtime: acontecem uma vez, na mão de quem opera o banco.

| #   | Cenário                                    | Condição                                                                     | Ação                                            | Código HTTP       |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------- | ----------------- |
| E1  | Telefone não normalizável                  | valor gravado não casa com nenhum formato reconhecido                        | **abortar**; corrigir à mão e recomeçar         | —                 |
| E2  | Candidato fora de toda janela de edição    | `created_at` não cai em nenhuma linha de `selection_processes`               | **abortar**; cadastrar a edição faltante        | —                 |
| E3  | Colisão criada pela normalização           | dois candidatos da mesma edição convergem para o mesmo telefone/email         | **abortar**; decidir qual linha fica            | —                 |
| E4  | Email já usado **nesta** edição            | insert viola `UNIQUE (process_id, email)`                                     | bloquear inscrição, apontando o campo           | `409 Conflict`    |
| E5  | Telefone já usado **nesta** edição         | insert viola `UNIQUE (process_id, phone)`                                     | bloquear inscrição, apontando o campo           | `409 Conflict`    |
| E6  | Telefone com formato irrecuperável no envio | payload não casa com a `PHONE_REGEX`                                          | bloquear inscrição, apontando `phone`           | `400 Bad Request` |

> **E4/E5 são os E1/E2 da FEAT-0001, com o escopo trocado.** O `code` e o `field` que o candidato recebe continuam idênticos (`EMAIL_ALREADY_REGISTERED`, `PHONE_ALREADY_REGISTERED`) — o que muda é o conjunto onde a duplicidade é procurada. Nada no front precisa saber disso.
>
> **E1–E3 abortam de propósito, e abortam ANTES.** A migration do D1 não é transacional: sem `BEGIN`/`COMMIT` (que o D1 rejeita em arquivo de migration), uma falha no meio deixa estado parcial — com `candidates` já dropada e os filhos ainda em `_bkp_*`. Descobrir o problema no meio da execução é o pior momento possível; por isso as três viram consulta prévia, e não `CHECK` que estoura no `INSERT`.

---

## 6. Critérios de Aceite

- [ ] Dois candidatos com o mesmo email em **edições diferentes** são aceitos
- [ ] Dois candidatos com o mesmo email na **mesma edição** — o segundo recebe `409 EMAIL_ALREADY_REGISTERED`
- [ ] O mesmo para telefone, com `PHONE_ALREADY_REGISTERED`
- [ ] `(71) 98888-7777`, `71988887777` e `+55 71 98888-7777` enviados na inscrição gravam **o mesmo valor** no banco
- [ ] Telefone fixo (10 dígitos) normaliza corretamente, não só celular
- [ ] Nenhuma linha de `candidates` fica com telefone fora de E.164 depois da migration
- [ ] Nenhuma linha fica com `process_id` nulo
- [ ] `gender` só contém `masculino`, `feminino` ou `outro`
- [ ] `GENDER_LABELS` continua produzindo os mesmos rótulos de antes (só as chaves mudaram)
- [ ] **A contagem de linhas dos cinco filhos é idêntica antes e depois da migration**
- [ ] `idx_candidates_created_at` existe depois da migration
- [ ] A planilha do Sheets continua recebendo linhas novas sem erro

---

## 7. Fora de Escopo

- **Reescrever a planilha do Google Sheets.** O sync é append-only por decisão da FEAT-0002 — linhas já escritas nunca são reescritas. Consequência aceita: inscrições já sincronizadas ficam com o telefone no formato antigo na planilha, e as novas saem em E.164. A planilha é saída de leitura, não fonte de verdade.
- **Normalização de etnia.** Os valores já são palavras inteiras (`branca`, `preta`, `parda`, `amarela`, `indigena`); só `nao-informado` é composto, e o rótulo dele (`"Prefiro não informar"`) nunca foi derivado do slug. Mexer nisso custaria a mesma reconstrução e não resolve problema nenhum hoje.
- **`member_profiles.phone`.** É snapshot do banco da tec, texto livre de um sistema que não controlamos, sem `UNIQUE` e sem CHECK — normalizá-lo seria alterar um espelho de origem externa. A `0005-member-auth.sql` já registra esse raciocínio.
- **Retirar o CHECK de `gender`.** A FEAT-0001 v3.1 classificou gênero como conjunto fechado e estável, o oposto de `course` (que perdeu o CHECK por crescer a cada processo). Continua valendo.
- **CRUD de processos seletivos** — herdado do fora-de-escopo da FEAT-0005.

---

## 8. Dados e Modelos

### 8.1 TypeScript Schema

```ts
// Mudança de valores, não de forma: os rótulos em GENDER_LABELS continuam
// "Masculino"/"Feminino"/"Outro" — só as CHAVES deixam de ser abreviadas.
// Nenhum slug de gender aparece hardcoded no front: o formulário deriva as
// opções de `GenderSchema.options`, então a troca não toca em JSX.
type Gender = "masculino" | "feminino" | "outro";

interface CandidateRow {
  id: string;

  // Novo — a edição em que esta inscrição aconteceu. É o que torna a
  // unicidade escopada possível, e substitui a inferência por janela de
  // data que a FEAT-0005 usava como dívida assumida (seção 4.2 de lá).
  process_id: string; // FK -> selection_processes.id

  course: Course;
  semester: Semester;
  gender: Gender;
  ethnicity: Ethnicity;

  name: string;
  email: string;
  // Sempre E.164: "+55" + DDD + número. Garantido pela normalização no
  // schema Zod (seção 8.2) e por CHECK no banco.
  phone: string;

  created_at: string;
  updated_at: string | null;
}
```

**Pontos de atenção para quem for implementar:**

- **`candidates` tem CINCO filhos agora, não três.** `candidate_applications` (CASCADE), `group_candidates` (CASCADE), `evaluations` (RESTRICT), `candidate_checkins` (CASCADE) e `checkin_events` (CASCADE) — quatro CASCADE. O procedimento da `0004` foi escrito para três; as duas tabelas novas vieram na `0006` e precisam entrar em cada passo.
- **`checkin_events` é histórico append-only.** Perdê-la é irreversível por definição — não há de onde reconstruir.
- **`idx_candidates_created_at` some no `DROP TABLE` e a `0004` não tem passo para ele.** Nasceu na `0006`, é sobre a própria `candidates`, e a listagem do check-in depende dele.
- **`candidate_checkins` tem `UNIQUE (candidate_id, process_id)`** e FKs para `selection_processes` e `users` — o restore precisa recriar a constraint, e essas duas tabelas não podem ser dropadas no meio.
- **A resolução da edição corrente já existe.** `CheckinRepository.resolveProcess()` e `selectionProcessWindowFor()` fazem exatamente o que a inscrição precisa — ver seção 9.

### 8.2 Normalização do telefone

Formato canônico: **E.164** — `+55` + DDD (2 dígitos) + número (8 ou 9 dígitos).

| Entrada                | Saída              |
| ---------------------- | ------------------ |
| `71988887777`          | `+5571988887777`   |
| `(71) 98888-7777`      | `+5571988887777`   |
| `+55 71 98888-7777`    | `+5571988887777`   |
| `7133334444` (fixo)    | `+557133334444`    |
| `+5571988887777`       | `+5571988887777` (idempotente) |
| qualquer outra coisa   | `null` → E6        |

O algoritmo é o mesmo nos dois lugares onde roda (TypeScript na inscrição, SQL na migration): remover tudo que não é dígito, depois

- 13 dígitos começando em `55` → prefixar `+`
- 10 ou 11 dígitos → prefixar `+55`
- qualquer outro tamanho → inválido

> **Aceitar fixo (10 dígitos) não é generosidade, é o que a regex atual já aceita** (`\d{4,5}-?\d{4}`). Estreitar isso agora rejeitaria dados que já estão no banco, e a migration abortaria em E1 por uma decisão nova, não por um dado ruim.

### 8.3 Migration esperada (`0007-candidate-edition-uniqueness.sql`), em esboço

```sql
-- 1. Backup dos CINCO filhos (cópia sem constraint, sobrevive ao drop do pai)
CREATE TABLE _bkp_candidate_applications AS SELECT * FROM candidate_applications;
CREATE TABLE _bkp_group_candidates       AS SELECT * FROM group_candidates;
CREATE TABLE _bkp_evaluations            AS SELECT * FROM evaluations;
CREATE TABLE _bkp_candidate_checkins     AS SELECT * FROM candidate_checkins;
CREATE TABLE _bkp_checkin_events         AS SELECT * FROM checkin_events;

-- 2. Tabela nova: sem UNIQUE de coluna, com UNIQUE de tabela por edição
CREATE TABLE candidates_new (
  id         TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE RESTRICT,

  course   TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 10),

  gender    TEXT NOT NULL CHECK (gender IN ('masculino', 'feminino', 'outro')),
  ethnicity TEXT NOT NULL DEFAULT 'nao-informado' CHECK (ethnicity IN (
    'branca', 'preta', 'parda', 'amarela', 'indigena', 'nao-informado'
  )),

  name  TEXT NOT NULL,
  email TEXT NOT NULL,
  -- Rede de segurança: se a normalização do passo 3 produzir algo
  -- inesperado, o INSERT falha em vez de gravar lixo.
  phone TEXT NOT NULL CHECK (substr(phone, 1, 3) = '+55' AND length(phone) BETWEEN 13 AND 14),

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT,

  UNIQUE (process_id, email),
  UNIQUE (process_id, phone)
);

-- 3. Copiar aplicando as três transformações (o CASE/ELSE mantém idempotente)
INSERT INTO candidates_new (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at, updated_at)
SELECT c.id,
       (SELECT sp.id FROM selection_processes sp WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at),
       c.course, c.semester,
       CASE c.gender WHEN 'mascu' THEN 'masculino' WHEN 'fem' THEN 'feminino' ELSE c.gender END,
       c.ethnicity, c.name, c.email,
       -- digits-only, depois prefixo por tamanho
       CASE
         WHEN length(<digits>) = 13 AND substr(<digits>, 1, 2) = '55' THEN '+' || <digits>
         WHEN length(<digits>) IN (10, 11)                           THEN '+55' || <digits>
       END,
       c.created_at, c.updated_at
  FROM candidates c;

-- 4. Drop filhos -> pai, e renomear
-- 5. Recriar os CINCO filhos com DDL consolidada + TODOS os índices
-- 6. Recriar idx_candidates_created_at  <- passo que a 0004 não tem
-- 7. Restore com colunas EXPLÍCITAS (nunca SELECT *), e drop das _bkp_*
```

> **Nunca `SELECT *` no restore.** A ordem física das tabelas de backup reflete o schema antigo — na `0004`, `referral_source_other` tinha entrado por `ALTER TABLE` e ficou no fim, o que faria um `SELECT *` casar valores com as colunas erradas.
>
> **Sem `BEGIN`/`COMMIT`** — o D1 rejeita transação explícita em arquivo de migration.
>
> **Esta migration exige `MAINTENANCE_MODE`**, diferente da `0006`, que era puramente aditiva.

---

## 9. Requisitos Técnicos Definidos

| Requisito                       | Decisão                                                                                                          | Justificativa                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Escopo da unicidade             | `UNIQUE (process_id, email)` e `UNIQUE (process_id, phone)`                                                        | Remove só o que bloqueia a recandidatura. Tirar o `UNIQUE` de vez deixaria a checagem prévia da FEAT-0001 como única barreira — justamente a que aquela spec declara não confiável sob concorrência |
| Onde a normalização entra       | `.transform()` no schema Zod de `shared`, não no service                                                          | Front e backend passam a normalizar pelo mesmo código. No service, o front continuaria mandando formato livre e a comparação prévia seguiria furada                                          |
| Resolução da edição na inscrição | Reusar `resolveProcess()` + `selectionProcessWindowFor()`, **movidos** de `checkin.repository.ts` para um `selection-process.repository.ts` | A lógica é do domínio de processo seletivo, não do check-in. Duplicar criaria duas regras de calendário divergindo em silêncio                                                              |
| Pré-checagem separada da migration | Três `SELECT` rodados antes, não `CHECK` que estoura durante                                                     | Migration do D1 não é transacional: falhar no meio deixa `candidates` dropada e os dados em `_bkp_*`. Descobrir o problema antes custa uma consulta; descobrir durante custa um restore      |
| `parseD1ConstraintError`        | Precisa reconhecer os nomes novos das constraints                                                                  | Ele casa hoje com `candidates.email`/`candidates.phone` (`api/src/lib/d1-errors.ts`), que deixam de existir com esse nome — sem ajuste, E4/E5 viram `500` genérico em vez de `409` com campo |
| CHECK de `gender`               | **Mantido**, com os valores novos                                                                                  | Conjunto fechado e estável, ao contrário de `course` (FEAT-0001 v3.1). E como a tabela está sendo reconstruída de qualquer forma, manter o CHECK não custa nada aqui                        |
| Chave do `sessionStorage` do wizard | Renomear                                                                                                       | O wizard espelha as respostas como JSON cru; quem estiver com ele aberto durante o deploy hidrataria `gender: "mascu"` contra o schema novo. Renomear descarta o estado velho em vez de falhar validação |

---

## 10. Perguntas Esclarecidas / Em Aberto

| #   | Pergunta                                                       | Resposta                                                                                                                                                                        | Decidido em |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | "Retirar o unique" é tirar de vez ou escopar por edição?      | **Escopar por edição.** Tirar de vez também removeria a proteção contra inscrição duplicada no mesmo processo                                                                    | 2026-08-17  |
| 2   | A troca de slug vale para etnia também?                       | **Não, só gênero.** Etnia já é palavra inteira; `nao-informado` tem rótulo próprio e não deriva do slug                                                                          | 2026-08-17  |
| 3   | Qual formato canônico do telefone?                            | **E.164** (`+5571988887777`) — pronto para WhatsApp/SMS sem conversão                                                                                                            | 2026-08-17  |
| 4   | O que fazer com telefone que não normaliza?                   | **Abortar.** Nada é alterado; corrige-se à mão e roda de novo                                                                                                                    | 2026-08-17  |
| 5   | Corrigir a planilha retroativamente?                          | **Não** (seção 7). Divergência aceita nas linhas já sincronizadas                                                                                                                | 2026-08-17  |
| 6   | Como exibir o telefone na tela de check-in?                   | **Formatado** (`(71) 98888-7777`), a partir do canônico. Inverte a proibição da FEAT-0005-UI §12 — que existia porque o formato não era garantido, e agora é                     | 2026-08-17  |
| 7   | E se um candidato antigo não pertencer a nenhuma edição?      | **Pendente até a pré-checagem rodar** (E2). Se aparecer, a resposta provável é cadastrar a edição faltante em `selection_processes`, não relaxar o `NOT NULL`                    | Pendente    |

---

## 11. Dependências Externas

- **Nenhuma** em tempo de request. A migration depende de `wrangler` e de acesso às duas bases D1.
- Não há script de backup no projeto: o export é manual (`wrangler d1 export`). O plano Free ainda dá **7 dias de Time Travel** como rede adicional.

---

## 12. Métricas de Sucesso

> Sugestões para discutir com o time:
>
> - Nenhuma inscrição rejeitada por email duplicado quando o candidato é de uma edição anterior (é o problema que motivou a feature)
> - Zero telefones fora de E.164 no banco, medido por consulta após a migration
> - Número de colisões encontradas na pré-checagem — é a medida de quanto o `UNIQUE` antigo já estava furado

---

## 13. Notas e Observações

- **O `UNIQUE` de telefone que existe hoje não garante o que promete.** A `PHONE_REGEX` aceita máscara, e a comparação é de string exata: `(71) 98888-7777` e `71988887777` convivem sem conflito. Isso significa que a duplicidade que a FEAT-0001 acha que previne já é contornável por acidente — e que a pré-checagem de colisão (E3) pode encontrar pares reais, não hipotéticos.
- **`process_id` substitui uma dívida assumida na FEAT-0005.** Lá, o vínculo candidato ↔ edição era **inferido** pela janela de datas, com o efeito colateral de que corrigir a janela de um processo remanejava retroativamente quem pertencia a ele. Com a coluna, o vínculo passa a ser afirmado no momento da inscrição, e aquela advertência ("tratar as datas de um processo com candidatos como imutáveis") deixa de valer.
- **A migration é a de maior risco já escrita neste projeto** — mais que a `0004`, que é a referência de perigo do `CONTEXT.md`. São cinco filhos em vez de três, um deles histórico append-only, e a transformação de dados é mais complexa (três mudanças simultâneas em vez de um remap de enum). O backup manual antes não é formalidade.
- **Manter o mesmo `code` de erro em E4/E5 é requisito funcional, não detalhe.** O front e a copy de erro da inscrição não mudam; o que mudou é invisível para o candidato, e deve continuar sendo.
- **A normalização no schema Zod tem um efeito colateral bom:** a checagem prévia de duplicidade (`findByEmail`/`findByPhone`) passa a comparar valores já canônicos, então ela deixa de errar por diferença de máscara. Hoje ela erra, e a constraint é que segura.
