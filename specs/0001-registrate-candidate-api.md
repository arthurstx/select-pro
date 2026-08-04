# SPEC — Registro de Candidato

ID: FEAT-0001
Módulo: Registro de candidatos
Versão: 3.1
Data: 2026-08-04
Status: DRAFT

> **Changelog v3.1 — normalização dos slugs de curso:** os valores de `Course` passaram a ser palavras inteiras e somente ASCII (`eng-comp` → `eng-computacao`, `eng-mecani` → `eng-mecanica`, `eng-prod` → `eng-producao`, `eng-eletri` → `eng-eletrica`, `arqui` → `arquitetura`, `eng-automação` → `eng-automacao`). `eng-civil` e `eng-quimica` não mudaram.
>
> **Motivação:** a grafia anterior misturava truncamentos arbitrários com um valor acentuado — o único não-ASCII do sistema, problemático em URL, filtro e export CSV. Junto disso, o CHECK de `course` foi removido do banco e o mapa de rótulos por extenso (`COURSE_LABELS`) saiu do componente de formulário para o pacote `shared`, de onde admin, export e email poderão consumi-lo sem duplicar. Ver os dois últimos pontos de atenção da seção 8.1.
>
> **Consequências:** migration `0004-normalize-course-slugs.sql` remapeia as linhas já existentes (nenhuma é apagada) e remove as tabelas de lookup `courses` e `semesters`, vazias e sem FK desde a 0001.
>
> **Changelog v3.0 — remoção do OTC:** o fluxo de dois passos (pré-registro → confirmação por código enviado por email) foi **eliminado**. A inscrição passa a ser um **passo único**: o candidato envia os dados do wizard e o registro é gravado direto no banco.
>
> **Motivação:** a etapa de confirmação por email era o ponto mais frágil do fluxo e não protegia nada que o produto realmente precisasse proteger. Modos de falha observados/previstos: o email não chega (spam, filtro do domínio institucional, atraso do provedor), o candidato desiste no meio do processo depois de já ter preenchido as 6 etapas, o candidato fecha a aba e perde o `pendingId` (que só vivia em memória). Em todos esses casos a inscrição era **perdida silenciosamente** — o candidato acreditava ter se inscrito e não estava no banco. Trocamos a verificação de posse do email por uma taxa de conversão previsível.
>
> **Consequências:** removidos o OTC (geração, hash, tipos, tentativas, expiração), o storage transitório em KV (`PendingRegistration`), o endpoint `POST /candidate/confirm-otc` e a dependência de provedor de email (Resend). O endpoint `POST /candidate/pre-register` foi renomeado para `POST /candidate/register`. Os cenários de erro E5–E10 da v2.0 (todos ligados a OTC/KV) deixaram de existir; a numeração foi refeita (ver seção 5).
>
> **Também na v3.0 — campo livre em "Como conheceu":** a opção `outros` de `referralSource` passa a exigir um texto complementar (`referralSourceOther`), persistido em `candidate_applications.referral_source_other`. Sem ele, `outros` acumula respostas sem informação nenhuma — justamente a resposta que o time precisa ler para descobrir canais de divulgação não mapeados.
>
> **Changelog v2.0 (histórico):** o front-end passou de formulário único para wizard de 6 etapas, trazendo o questionário (como conheceu, MEJ, experiências/motivação, disponibilidade), persistido em `candidate_applications`. Essa parte permanece válida.

---

## 1. Objetivo

Permitir que um candidato se cadastre no processo seletivo em **um único passo**:

O candidato envia seus dados gerais (nome completo, email institucional, curso, semestre, gênero, telefone, cor/etnia) **e** as respostas do questionário do processo seletivo (como conheceu, confirmação sobre o MEJ, experiências/motivação, disponibilidade). O sistema valida os dados e cria o candidato e sua inscrição no banco de dados, de forma atômica, na mesma requisição.

Não há verificação de posse do email. O email continua sendo coletado e continua sendo único por candidato (constraint no banco), mas serve como **canal de contato do processo seletivo**, não como prova de identidade — a identidade real é verificada presencialmente, no dia da seleção.

**Fora do escopo desta spec:** autenticação/login do candidato (o candidato não possui conta na aplicação), avaliação do candidato, e qualquer forma de verificação de email/telefone.

---

## 2. Atores

- **Ator primário:** candidato

**Restrição:** candidato não possui login na plataforma e não há barreira de validação de identidade neste fluxo — a inscrição é pública e confia nos dados informados. Ver seção 13 para o que isso implica.

---

## 3. User Story

```gherkin
Como candidato,
Eu quero me inscrever no processo seletivo informando meus dados
e respondendo o questionário,
Para eu poder ser avaliado posteriormente na aplicação.
```

---

## 4. Fluxo Principal (Happy Path)

> Esta spec cobre apenas a camada de API/backend. O gatilho de UI (wizard de 6 etapas) está descrito em FEAT-0001-UI.

### 4.1 Inscrição — `POST /candidate/register`

1. Candidato envia seus dados gerais + respostas do questionário (payload completo, seção 8.2).
2. Sistema valida:
   - formato de email
   - formato de telefone
   - email já cadastrado (candidato existente no banco)
   - telefone já cadastrado (candidato existente no banco)
3. Sistema cria o candidato **e** sua inscrição (linha em `candidate_applications`, ver seção 8.1) no banco de dados **na mesma transação/batch**, gerando um **novo id** (UUID v4) para o candidato. As duas linhas entram juntas ou nenhuma delas entra — nunca um candidato sem inscrição.
   - **Defesa contra duplicidade concorrente:** o insert do candidato respeita as constraints `unique` de email e telefone. A checagem do passo 2 é uma otimização de mensagem de erro, não a barreira real — duas requisições simultâneas com o mesmo email podem passar as duas pelo passo 2, e é a constraint que decide qual persiste (ver E5).
   - Se o insert falhar por violação de constraint, o sistema deve inspecionar qual constraint foi violada (nome/campo retornado pelo erro do banco) para devolver uma mensagem específica (email vs. telefone), em vez de um erro genérico.
4. Sistema retorna `201 Created` com os dados do candidato criado.

> **Sem estado intermediário:** não existe mais registro "pendente". Ou o candidato está no banco (inscrito), ou não está. Isso elimina o KV, o job/TTL de limpeza e toda a classe de bugs em que o candidato acredita ter se inscrito sem estar no banco.

---

## 5. Fluxos Alternativos e Erros

| #   | Cenário                                          | Condição                                                                                                        | Ação             | Código HTTP       |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------- |
| E1  | Email já cadastrado                              | email pertence a candidato existente no banco (detectado na checagem prévia)                                    | bloquear inscrição | `409 Conflict`    |
| E2  | Telefone já cadastrado                           | telefone pertence a candidato existente no banco (detectado na checagem prévia)                                 | bloquear inscrição | `409 Conflict`    |
| E3  | Email inválido                                   | formato de email incorreto                                                                                      | bloquear inscrição | `400 Bad Request` |
| E4  | Telefone inválido                                | formato de telefone incorreto                                                                                   | bloquear inscrição | `400 Bad Request` |
| E5  | Email ou telefone em uso (detectado no insert)   | insert viola constraint `unique` — duas inscrições concorrentes com o mesmo email/telefone passaram pelo passo 2 | inspecionar qual constraint falhou e retornar o mesmo erro de E1/E2 (email ou telefone) | `409 Conflict` |
| E6  | Origem "outros" sem descrição                    | `referralSource === "outros"` e `referralSourceOther` ausente ou vazio (v3.0)                                    | bloquear inscrição, apontando o campo `referralSourceOther` | `400 Bad Request` |

> E5 não é um erro novo para o cliente: ele devolve exatamente o mesmo `code`/`field` de E1/E2. A distinção existe só para quem implementa — é o ponto de detecção que muda (constraint do banco em vez da checagem prévia), e é a razão pela qual o tratamento de erro do insert não pode ser genérico.
>
> **Removidos na v3.0:** E5–E9 da v2.0 (OTC expirado, OTC inválido, OTC de tipo incorreto, excesso de tentativas) deixaram de existir junto com o OTC. E10 da v2.0 (conflito detectado na confirmação) virou o E5 desta versão, agora detectado na própria inscrição.

---

## 6. Critérios de Aceite

- [ ] Email válido e não duplicado entre candidatos
- [ ] Telefone válido e não duplicado entre candidatos
- [ ] `mejAcknowledged` só é aceito como `true`
- [ ] `referralSourceOther` é exigido quando (e somente quando) `referralSource === "outros"`, e gravado como `null` nas demais opções
- [ ] Candidato e inscrição (questionário) são criados atomicamente — nunca um sem o outro
- [ ] Conflito de email/telefone retorna erro específico do campo, seja detectado na checagem prévia (E1/E2) ou na constraint (E5)
- [ ] Nenhum registro intermediário/pendente é criado em qualquer storage
- [ ] Uma inscrição bem-sucedida não depende de nenhum serviço externo (email, fila, etc.)

---

## 7. Fora de Escopo

- Avaliação do candidato
- JWT / autenticação do candidato
- Verificação de email ou telefone (OTC, magic link, SMS) — **removido deliberadamente na v3.0**
- Edição da inscrição após o envio (o candidato não tem como voltar atrás sozinho — ver seção 13)

---

## 8. Dados e Modelos

### 8.1 TypeScript Schema

```ts
// Entidade definitiva — criada no momento da inscrição
// Slugs normalizados na v3.1: palavra inteira e somente ASCII. A grafia
// anterior misturava truncamentos arbitrários (`eng-comp`, `eng-mecani`,
// `eng-eletri`, `arqui`) com um valor acentuado (`eng-automação`), o único
// não-ASCII do sistema — problemático em URL, filtro e export CSV.
type Course =
  | "eng-computacao"
  | "eng-civil"
  | "eng-mecanica"
  | "eng-quimica"
  | "eng-producao"
  | "eng-automacao"
  | "eng-eletrica"
  | "arquitetura";

type Semester = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

type Gender = "mascu" | "fem" | "outro";

// Padrão IBGE + opção de recusa (decisão v2.0) — mesmo nível de "enum fechado
// validado por CHECK" que Course/Gender já recebem.
type Ethnicity = "branca" | "preta" | "parda" | "amarela" | "indigena" | "nao-informado";

interface CandidateRow {
  id: string; // UUID v4 gerado no momento do insert

  course: Course;
  semester: Semester;
  gender: Gender;
  ethnicity: Ethnicity;

  name: string;
  email: string;
  phone: string;

  created_at: string;
  updated_at: string | null;
}

// Respostas do questionário do processo seletivo (etapas 2-5 do wizard, ver
// FEAT-0001-UI). Relação 1:1 com CandidateRow, isolada em tabela própria para
// manter `candidates` como identidade+demografia enxuta e permitir um segundo
// processo seletivo no futuro sem alterar essa tabela.
type ReferralSource = "instagram" | "linkedin" | "campus" | "indicacao" | "outros";

interface CandidateApplicationRow {
  id: string;
  candidate_id: string; // FK unique -> candidates.id (garante o 1:1)

  referral_source: ReferralSource;
  // Novo em v3.0 — texto livre exigido quando referral_source === "outros",
  // e obrigatoriamente `null` em qualquer outra opção (ver seção 8.2).
  referral_source_other: string | null;
  mej_acknowledged: boolean; // checkbox "li e entendi sobre o MEJ" — sempre true para chegar até aqui
  experience: string; // "Experiências e Skills", limite de 1000 caracteres (ver FEAT-0001-UI)
  motivation: string; // "Motivação", limite de 500 caracteres
  saturday_restriction: boolean; // "possui restrição para o processo seletivo no sábado?"
  special_needs: boolean; // "possui alguma necessidade especial?"

  created_at: string;
  updated_at: string | null;
}
```

**Pontos de atenção para quem for implementar:**

- **Não existe mais entidade transitória.** `PendingRegistration`, `OtcType` e tudo que vivia no KV foram removidos do contrato na v3.0 — se aparecerem em algum lugar do código, é resíduo.
- `referral_source_other` é **condicionalmente obrigatório**: exigido (não vazio) quando `referral_source === "outros"`, e normalizado para `null` em todas as outras opções — mesmo que o cliente envie um valor. A regra vive no schema Zod compartilhado (validação) e na normalização do service (persistência); o banco aceita a coluna como `TEXT` nullable, sem CHECK cruzado entre colunas.
- Unicidade de `email`/`phone` é garantida via constraint `unique` no banco. A checagem prévia (passo 2 do fluxo 4.1) existe para dar uma mensagem melhor no caso comum; a constraint é quem garante a invariante.
- O insert de `candidates` e `candidate_applications` roda como um único batch — ver seção 9.
- **`course` não tem CHECK no banco (decisão v3.1).** O conjunto de cursos é o único enum do contrato que se espera crescer (um curso novo a cada processo seletivo). No SQLite, alterar um CHECK exige recriar a tabela inteira — e `candidates` tem três filhos, dois com `ON DELETE CASCADE`, o que torna cada rebuild uma operação de risco sobre dados de produção. Por isso o enum vive só em `CourseSchema` (`shared`), que já valida no front e na API: adicionar um curso passa a ser uma linha em `shared`, sem migration. `gender`, `ethnicity`, `semester` e os demais enums seguem com CHECK — são conjuntos fechados e estáveis.
- Não há tabela de lookup de cursos. As tabelas `courses` e `semesters` existiram vazias e sem nenhuma FK apontando para elas desde a 0001, e foram removidas na migration 0004 — trabalhar com ID de curso exigiria manter linhas de lookup para um conjunto que já é constante no código.

### 8.2 Request Body

**`POST /candidate/register`**

```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "course": "eng-computacao",
  "semester": 1,
  "gender": "mascu",
  "ethnicity": "nao-informado",
  "referralSource": "instagram",
  "referralSourceOther": "string (só quando referralSource === \"outros\")",
  "mejAcknowledged": true,
  "experience": "string (até 1000 caracteres)",
  "motivation": "string (até 500 caracteres)",
  "saturdayRestriction": false,
  "specialNeeds": false
}
```

> O payload é o do antigo `pre-register` (v2.0) mais `referralSourceOther` — o nome do endpoint e o que acontece depois também mudaram. Um campo por etapa do wizard (FEAT-0001-UI, etapas 1–5): `name`/`email`/`phone`/`course`/`semester`/`gender` (etapa 1), `referralSource` + `referralSourceOther` (etapa 2), `mejAcknowledged` (etapa 3, deve ser exatamente `true` — o backend rejeita `false`), `experience`/`motivation` (etapa 4), `saturdayRestriction`/`specialNeeds`/`ethnicity` (etapa 5). O front envia tudo de uma vez só no fim do wizard (etapa 6); não há chamadas intermediárias de API por etapa.
>
> **Regra de `referralSourceOther` (v3.0):**
>
> - `referralSource === "outros"` → obrigatório, string não vazia (máx. 100 caracteres). Ausente/vazio ⇒ `400` (E6).
> - qualquer outra opção → o campo é ignorado e persistido como `null`, mesmo que o cliente envie um valor.

### 8.3 Response — Sucesso

**`POST /candidate/register` (`201 Created`)**

```json
{
  "data": {
    "id": "uuid",
    "status": "registered",
    "name": "string",
    "email": "string",
    "createdAt": "timestamp"
  }
}
```

> `status` é fixo em `"registered"` — existe para manter um envelope estável e legível, não para representar uma máquina de estados (não há outro estado possível: ou a inscrição existe, ou a requisição falhou).

### 8.4 Response — Erros

> Seguir o padrão de envelope de erro já usado no projeto (não redefinido aqui). Os códigos HTTP de cada cenário estão na seção 5.

---

## 9. Requisitos Técnicos Definidos

| Requisito                                | Decisão                                                                                                                                                             | Justificativa                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verificação de posse do email            | **Não implementada** (v3.0)                                                                                                                                         | O custo (inscrições perdidas quando o email não chega ou o candidato abandona o fluxo) supera o benefício num processo seletivo em que a identidade é verificada presencialmente                    |
| Storage intermediário                    | **Nenhum** — o candidato é gravado direto no D1                                                                                                                     | Sem estado pendente não há divergência possível entre "o candidato acha que se inscreveu" e "o candidato está no banco"                                                                            |
| Id do candidato                          | UUID v4 gerado no momento do insert                                                                                                                                 | Mantido da v2.0                                                                                                                                                                                    |
| Atomicidade candidato + inscrição        | O insert de `candidates` e `candidate_applications` deve rodar como uma única transação/batch (`D1Database.batch`) — se qualquer um falhar, nenhum dos dois persiste | Evita o estado inconsistente "candidato existe, mas sem respostas do questionário" (ou vice-versa), que não tem representação válida no domínio                                                     |
| Checagem prévia de email/telefone        | Consulta ao banco antes do insert, mas **não** é a barreira de integridade                                                                                          | Dá a mensagem específica no caso comum (candidato tentando se inscrever duas vezes); a garantia real é a constraint `unique`, que também cobre o caso concorrente                                  |
| Erro de constraint no insert             | O backend deve inspecionar qual constraint (email ou telefone) foi violada e devolver o mesmo erro específico de E1/E2, não um genérico                             | O candidato precisa saber **qual** campo corrigir; um `409` genérico o deixa sem ação possível                                                                                                     |
| Dependências externas em tempo de request | **Nenhuma** além do próprio D1                                                                                                                                      | Requisito de confiabilidade que motivou a v3.0: nenhum provedor externo pode ficar entre o candidato e a inscrição gravada                                                                          |

---

## 10. Perguntas Esclarecidas / Em Aberto

| #   | Pergunta                                                                                                  | Resposta                                                                                                                                                                          | Decidido em |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | O candidato é persistido no pré-registro ou só na confirmação?                                            | **Obsoleta na v3.0** — não há mais dois passos; o candidato é persistido na única requisição de inscrição                                                                          | 2026-08-03  |
| 2   | Um novo pré-registro com email já pendente deve bloquear, sobrescrever ou gerar um novo OTC independente? | **Obsoleta na v3.0** — não existe mais estado pendente                                                                                                                            | 2026-08-03  |
| 3   | Registros pendentes nunca confirmados precisam de job de limpeza?                                         | **Obsoleta na v3.0** — não há registros pendentes                                                                                                                                 | 2026-08-03  |
| 4   | Tempo de expiração e limite de tentativas do OTC                                                          | **Obsoleta na v3.0** — não há OTC                                                                                                                                                 | 2026-08-03  |
| 5   | Falha no envio do email deve impedir a gravação?                                                          | **Obsoleta na v3.0** — o fluxo não envia email                                                                                                                                    | 2026-08-03  |
| 6   | Sem verificação de email, como tratar inscrições duplicadas/trote (email de terceiro)?                    | Não definido — hoje a única proteção é a unicidade de email/telefone. Se virar problema real, a resposta provável é moderação/deduplicação manual antes da seleção, não voltar o OTC | Pendente    |
| 7   | O candidato precisa de algum comprovante da inscrição?                                                    | Não definido — a tela de sucesso (FEAT-0001-UI) é o único comprovante hoje. Um email de "inscrição recebida" foi considerado e deixado de fora da v3.0 para não reintroduzir dependência externa | Pendente    |

## 11. Dependências Externas

- **Nenhuma.** A v3.0 removeu a dependência de provedor de email (Resend). O fluxo depende apenas do D1.

---

## 12. Métricas de Sucesso

> Sugestões para discutir com o time de produto:
>
> - Taxa de conclusão do wizard (etapa 1 iniciada → inscrição gravada) — comparável com a taxa da v2.0 (pré-registro → confirmação) para medir o ganho da remoção do OTC
> - Taxa de erro por campo (E1–E5), para identificar validação mal calibrada
> - Volume de inscrições duplicadas/inválidas (proxy do custo de não verificar email)

---

## 13. Notas e Observações

- **O que se perdeu ao remover o OTC:** a garantia de que o email informado pertence ao candidato. Na prática isso significa que (a) alguém pode se inscrever com o email de outra pessoa, e (b) um erro de digitação no email só é descoberto quando a comunicação do processo seletivo não chega. Ambos são aceitos: a seleção é presencial e o contato também acontece por telefone/WhatsApp.
- **O que se ganhou:** nenhuma inscrição é perdida por email não entregue, por candidato que abandona o fluxo no meio, ou por F5 na tela de verificação. O caminho entre "candidato preencheu tudo" e "candidato está no banco" passou a ser uma única requisição sem dependência externa.
- A inscrição é **final** do ponto de vista do candidato: não há edição nem cancelamento pela UI. Correções passam por quem administra o processo seletivo, direto no banco.
- A tabela `candidates` continua contendo apenas inscrições completas — a diferença é que agora isso é consequência de não existir estado intermediário, e não de um passo de confirmação.
- Manter a mensagem de erro específica (email vs. telefone) no insert continua sendo um **requisito funcional**, não detalhe de implementação: é o que permite o candidato saber qual campo corrigir.
