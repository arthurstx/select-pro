# SPEC — Validação de Presença do Candidato

ID: FEAT-0005
Módulo: Operação do processo seletivo — check-in
Versão: 1.2
Data: 2026-08-11
Status: DRAFT

> **Changelog v1.2 — as duas pendências operacionais viraram decisão.**
>
> **A edição corrente passa a ser criada sob demanda, pelo próprio sistema**, e não por `INSERT` manual nem por tarefa agendada. Quando a resolução do processo corrente (seção 4.1) não encontra linha para a data de hoje, ela cria a linha ali mesmo, de forma idempotente, e segue. Deixar isso para uma pessoa lembrar significava que o check-in amanheceria parado em E2 no primeiro dia útil de janeiro — um modo de falha anual, previsível, e ainda assim garantido de acontecer alguma vez.
>
> **O desmarcar passa a deixar rastro, em tabela de eventos própria (`checkin_events`).** `candidate_checkins` continua sendo estado puro (existe = presente, `DELETE` = ausente), e cada mudança real de estado grava também uma linha de log com ator, ação e horário. A tela de logs do admin e o webhook continuam fora de escopo — o que muda é que, quando existirem, terão história para mostrar. Registrar depois seria impossível: o histórico não gravado não volta.
>
> **Consequências:** a migration `0006` ganha uma terceira tabela e continua puramente aditiva; o cron (`scheduled` de `api/src/index.ts`) **não é alterado**; a regra de janela (jan–jul / ago–dez) passa a viver **também em código**, não só em linhas de banco; e E2 deixa de ser um estado alcançável em operação normal — ver seções 5, 9 e 13.
>
> **Changelog v1.1 — as janelas dos processos seletivos ficaram definidas:** **janeiro a julho** (`AAAA.1`) e **agosto a dezembro** (`AAAA.2`). Elas não se sobrepõem e cobrem o ano inteiro, o que garante que sempre existe exatamente um processo corrente e desbloqueia o seed da migration (seção 10, pergunta 1).
>
> **Também na v1.1 — a unicidade por edição foi considerada e adiada.** Chegou a ser especificada aqui: `candidates` ganharia `process_id`, e os `UNIQUE` globais de `email` e `phone` virariam `UNIQUE (process_id, email)` e `UNIQUE (process_id, phone)`, destravando a recandidatura entre semestres.
>
> **Motivo do adiamento:** remover um `UNIQUE` inline no SQLite exige **reconstruir `candidates`** — a operação de maior risco deste banco, documentada no cabeçalho da `0004` (três filhos, dois com `ON DELETE CASCADE`). E há uma segunda dívida de schema esperando na mesma tabela: os telefones estão gravados sem padronização. Fazer duas reconstruções da mesma tabela para resolver dois problemas é dobrar a exposição ao único procedimento que pode destruir as inscrições. As duas mudanças vão juntas, numa reconstrução só, na spec seguinte.
>
> **Consequência:** esta spec volta a ser **puramente aditiva** no banco — a migration `0006` só cria tabelas e índices, sem tocar em `candidates`. Em troca, o vínculo do candidato com a edição continua sendo inferido pela janela de datas, e a recandidatura continua bloqueada (seção 7 e seção 13).
>
> **Contexto:** esta é a primeira spec de **operação** do processo seletivo. Tudo que veio antes tratava de entrada no sistema — a inscrição pública do candidato (FEAT-0001) e o cadastro/login do membro (FEAT-0003). Aqui, pela primeira vez, um membro autenticado **age sobre o dado de outra pessoa**.
>
> Duas consequências disso moldam a spec inteira. A primeira: a FEAT-0003, seção 13, encerrou dizendo que "a primeira spec que precisar de autorização é quem vai definir o middleware de papel — e vai encontrar o dado já pronto". É esta. A segunda: é o primeiro endpoint que **lista** dados, e portanto o primeiro que precisa paginar — a convenção de paginação do projeto nasce aqui.
>
> **O número desta spec é 0005, não 0004.** O ID FEAT-0004 foi retirado de circulação quando a recuperação de senha foi absorvida pela FEAT-0003 v1.2 (ver seção 10, pergunta 8 daquela spec). A migration correspondente é a `0006`, porque a `0005-member-auth.sql` já existe.

---

## 1. Objetivo

Permitir que qualquer membro autenticado confirme a presença dos candidatos no dia do processo seletivo, e desfaça essa confirmação quando ela for feita por engano.

O sistema expõe uma lista paginada dos candidatos inscritos no processo seletivo corrente, com o estado de presença de cada um, filtrável por nome e por status. Marcar e desmarcar presença são operações **idempotentes**, porque vários avaliadores operam a mesma lista ao mesmo tempo, na porta do evento, e uma colisão entre eles não pode virar erro.

Esta spec também introduz a entidade **processo seletivo**, que passa a escopar a presença. A CIMATEC jr roda um processo por semestre, então a mesma pessoa pode ter presença em edições diferentes sem que uma contamine a outra — o que ainda não é possível é ela **se inscrever** duas vezes, e isso fica para a spec seguinte (seção 7).

**Fora do escopo desta spec:** avaliação do candidato, agrupamento em salas, CRUD de processos seletivos, e a tela de logs administrativos (ver seção 7).

---

## 2. Atores

- **Ator primário:** membro autenticado da CIMATEC jr, em papel `avaliador` ou `admin`
- **Ator secundário:** candidato — objeto da ação, nunca autor dela

**Restrição:** o candidato não possui login na aplicação (FEAT-0001, seção 2) e portanto **não faz o próprio check-in**. Não existe auto-atendimento neste fluxo: a presença é sempre afirmada por um membro, que é quem responde por ela. Ver seção 13.

---

## 3. User Story

```gherkin
Como avaliador,
Eu quero confirmar a presença dos candidatos que compareceram
e enxergar quem já foi confirmado,
Para eu poder conduzir a dinâmica sabendo quem está na sala.
```

```gherkin
Como avaliador,
Eu quero desfazer uma confirmação de presença,
Para eu poder corrigir um toque errado sem procurar quem administra o banco.
```

---

## 4. Fluxo Principal (Happy Path)

> Esta spec cobre apenas a camada de API/backend. As telas estão descritas em FEAT-0005-UI.

As três rotas vivem sob o prefixo **`/candidates`** (plural), autenticado. Ele é distinto de `/candidate` (singular), que é o prefixo público da inscrição e usa `cors()` refletindo qualquer origin — ver seção 9.

### 4.1 Processo seletivo corrente

Não é uma rota. É a resolução que **antecede** os três fluxos abaixo:

1. Sistema busca em `selection_processes` a linha cuja janela `[starts_at, ends_at]` contém a data de hoje.
2. Nenhuma linha ⇒ E2, e nenhum dos fluxos abaixo prossegue.

As janelas são semestrais e não se sobrepõem: **janeiro a julho** (`AAAA.1`) e **agosto a dezembro** (`AAAA.2`). A assimetria de tamanho é intencional — reflete o calendário real da tec, não uma divisão aritmética do ano.

> **O processo corrente é derivado da data, não de uma flag `is_active`.** Uma coluna booleana precisaria ser desligada à mão quando o processo termina, e o modo de falha desse esquecimento é silencioso e caro: o check-in do semestre novo cairia dentro do processo velho, misturando duas edições na mesma tabela sem nenhum erro visível. A janela de datas erra para o outro lado — na ausência de linha, o sistema para e diz por quê (E2).

### 4.1.1 Criação automática da edição

A linha da edição corrente **não** depende de ninguém lembrar de criá-la. Quando o passo 2 acima não encontra linha, a própria resolução a cria:

1. Sistema calcula o rótulo e a janela correspondentes à data de hoje: `AAAA.1` para os meses 1–7, `AAAA.2` para 8–12.
2. Sistema insere a linha em `selection_processes`, **sem erro se ela já existir** (`ON CONFLICT (label) DO NOTHING`).
3. Sistema relê a linha e segue o fluxo normalmente. A requisição que disparou a criação **não falha** — ela é atendida com a edição recém-criada.
4. Sistema loga `selection_process.created` uma única vez, na requisição que efetivamente criou.

Isso vive **num único ponto** do código — a resolução do processo corrente, usada pelos três fluxos da seção 4. Nenhum handler chama a criação diretamente.

> **A criação é idempotente porque `label` é `UNIQUE`, e isso é o que resolve a corrida.** Dois avaliadores abrindo a tela no mesmo segundo do dia 1º de janeiro disparam dois `INSERT`; um vence, o outro vira no-op, e ambos releem a mesma linha. Sem o `UNIQUE`, a mesma edição existiria duas vezes e a presença se dividiria entre elas silenciosamente.
>
> **Só a primeira requisição de cada semestre escreve.** Depois que a linha existe, a resolução é uma leitura indexada como qualquer outra — não há escrita por requisição.
>
> **O custo dessa decisão é que a regra jan–jul / ago–dez passa a existir em dois lugares:** nas linhas semeadas pela migration e no código que gera as próximas. Mudar o calendário da tec deixou de ser um `UPDATE` e passou a ser um deploy — mais a correção das linhas que o sistema já tiver criado com a regra antiga. Aceitável porque o calendário é estável, e é a razão pela qual a geração ficou concentrada num ponto só.
>
> ⚠️ **Efeito colateral a conhecer: não existe mais "sistema sem processo seletivo".** Apagar a linha da edição corrente no D1 não desliga o check-in — a próxima requisição a recria. Se algum dia for preciso congelar a operação, o instrumento é `MAINTENANCE_MODE` (E10), não mexer em `selection_processes`.

### 4.2 Listagem — `GET /candidates`

1. Membro autenticado envia `page`, `per_page`, `search` e `status` (todos opcionais, seção 8.2).
2. Sistema resolve o processo corrente (4.1).
3. Sistema seleciona os candidatos cujo `created_at` cai dentro da janela do processo, aplicando:
   - `search` — comparação parcial, case-insensitive, sobre `name`
   - `status` — `presentes` (existe check-in), `ausentes` (não existe), `todos` (sem filtro)
4. Sistema ordena por `created_at ASC, id ASC` e aplica `LIMIT`/`OFFSET`.
5. Sistema retorna `200 OK` com a página e os metadados de paginação (seção 8.3).

> **Busca, filtro e paginação são resolvidos no mesmo `SELECT`, no servidor.** Filtrar no cliente sobre uma página já recortada produz o pior resultado possível: a página 1 de "ausentes" mostraria só os ausentes _que por acaso estavam entre os 25 primeiros_, e o total exibido seria mentira. Ou os três acontecem juntos no banco, ou nenhum deles é confiável.
>
> **O vínculo candidato ↔ edição é inferido pela data, e isso é uma dívida assumida.** O ideal seria uma coluna `process_id` afirmada na inscrição, porque a inferência muda retroativamente se alguém corrigir a janela de um processo. A coluna exige reconstruir `candidates`, e essa reconstrução foi adiada para a spec seguinte (ver changelog v1.1). Até lá: **não editar as datas de um processo que já tem candidatos**.

### 4.3 Marcar presença — `PUT /candidates/{id}/checkin`

1. Membro autenticado chama a rota com o id do candidato.
2. Sistema resolve o processo corrente (4.1) e verifica que o candidato existe (E1) e pertence à janela desse processo (E3).
3. Sistema insere a linha em `candidate_checkins` com `checked_in_by` = `sub` do token e `checked_in_at` = agora, **ignorando o conflito** com a constraint `UNIQUE (candidate_id, process_id)`.
4. **Se e somente se o passo 3 alterou o estado**, sistema grava uma linha em `checkin_events` com `action = 'marcou'` e `actor_id` = `sub` do token, na mesma transação.
5. Sistema retorna `200 OK` com o estado resultante do check-in.

### 4.4 Desmarcar presença — `DELETE /candidates/{id}/checkin`

1. Membro autenticado chama a rota com o id do candidato.
2. Sistema resolve o processo corrente (4.1) e verifica que o candidato existe (E1).
3. Sistema apaga a linha de `candidate_checkins` correspondente ao par (candidato, processo). Se não houver linha, nada acontece.
4. **Se e somente se o passo 3 alterou o estado**, sistema grava uma linha em `checkin_events` com `action = 'desmarcou'` e `actor_id` = `sub` do token, na mesma transação.
5. Sistema retorna `204 No Content`.

> **O evento só é gravado quando o estado muda de verdade.** Sem essa condição, cada duplo toque no celular e cada retry por rede instável viraria uma linha no log — e o log do dia do credenciamento, que é o único que alguém vai querer ler, ficaria dominado por ruído de repetição. Um `PUT` que caiu em E4 não aconteceu do ponto de vista do domínio; ele não deve aparecer na história.
>
> **A gravação do estado e a do evento são atômicas.** As duas entram juntas ou nenhuma entra — um `D1Database.batch`, mesmo mecanismo que a FEAT-0001 usa para candidato + inscrição. Um log que diverge do estado que ele descreve é pior do que não ter log: ele afirma com confiança algo que não aconteceu. A condicionalidade do passo 4 pode ser resolvida em SQL puro (`... WHERE changes() > 0`, avaliado dentro do batch) ou lendo `meta.changes` antes de montar o batch — a spec exige a atomicidade, não a técnica.

> **`PUT` e `DELETE`, não `POST` e `POST`.** Os dois métodos são idempotentes por definição, e o cenário que exige isso é concreto: dois avaliadores na porta do evento tocando o mesmo nome ao mesmo tempo. Com `POST` + `409` no segundo, um deles vê uma mensagem de erro para uma operação que atingiu exatamente o estado desejado — e passa a duvidar da lista. Com `PUT`, os dois veem sucesso, o banco tem uma linha só, e `checked_in_by` guarda quem chegou primeiro.
>
> A mesma lógica vale para o `DELETE` de uma presença que não existe (E5): o estado pedido já é o estado atual.

---

## 5. Fluxos Alternativos e Erros

| #   | Cenário                           | Condição                                                                         | Ação                                                                 | Código HTTP               |
| --- | --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| E1  | Candidato inexistente             | `id` da rota não corresponde a nenhuma linha de `candidates`                     | bloquear a operação                                                  | `404 Not Found`           |
| E2  | Edição corrente indeterminável    | a resolução não encontrou **nem conseguiu criar** a linha da edição de hoje      | bloquear a operação, inclusive a listagem                            | `409 Conflict`            |
| E3  | Candidato de outra edição         | candidato existe, mas seu `created_at` está fora da janela do processo corrente  | bloquear a marcação de presença                                      | `409 Conflict`            |
| E4  | Presença já confirmada            | dois avaliadores marcam o mesmo candidato, ou o mesmo avaliador repete a chamada | **não é erro** — `ON CONFLICT DO NOTHING`, devolve o estado existente, **sem gravar evento** | `200 OK`     |
| E5  | Desmarcar presença que não existe | `DELETE` sobre par (candidato, processo) sem linha em `candidate_checkins`       | **não é erro** — no-op, **sem gravar evento**                        | `204 No Content`          |
| E6  | Paginação inválida                | `page < 1`, `per_page < 1` ou `per_page > 100`, ou valor não numérico             | bloquear a listagem, apontando o campo                               | `400 Bad Request`         |
| E7  | `status` inválido                 | `status` fora de `todos` \| `presentes` \| `ausentes`                             | bloquear a listagem, apontando o campo                               | `400 Bad Request`         |
| E8  | Sem credencial válida             | header `Authorization` ausente, malformado, token inválido ou expirado            | negar (comportamento herdado de `requireAuth`, FEAT-0003)            | `401 Unauthorized`        |
| E9  | Papel não autorizado              | token válido, mas `role` fora do conjunto permitido pela rota                      | negar                                                                | `403 Forbidden`           |
| E10 | Modo de manutenção ativo          | `MAINTENANCE_MODE === "true"`                                                    | responder sem tocar no banco                                         | `503 Service Unavailable` |

> **E4 e E5 são as duas únicas linhas desta tabela que não produzem erro, e isso é o desenho, não uma lacuna.** Ambas descrevem uma requisição cujo estado final é o estado pedido. Transformá-las em `409` faria a API reportar falha para operações bem-sucedidas, num fluxo em que o cliente tem toda a razão de repetir a chamada (rede instável no local do evento, dois avaliadores na mesma fila, duplo toque no celular).
>
> **E2 é uma guarda, não um estado de negócio — e é por isso que ela permanece.** Com a criação automática (seção 4.1.1), toda data cai em alguma edição: ou ela já existe, ou é criada na hora. Chegar em E2 significa que a criação foi tentada e não produziu linha legível, ou seja, que uma invariante do sistema foi violada. A guarda existe para esse caso não virar comportamento inventado mais adiante no fluxo.
>
> **Ela derruba até a listagem, de propósito.** Seria possível listar todos os candidatos sem saber a edição, mas a lista deixaria de significar "quem devo receber hoje" e passaria a significar "todo mundo que já se inscreveu na história da aplicação" — sem nada na resposta que diferencie os dois casos. Falhar é a única resposta que não engana.
>
> **E2 continua sendo `409`, e não `500`, apesar de sinalizar defeito.** Um código específico diz o que falhou; um `500` genérico obriga quem estiver diagnosticando a ir aos logs para descobrir a mesma coisa. Se ele aparecer em produção, é bug — não configuração faltando.
>
> **E3 é `409`, não `404`.** O candidato existe; ele só não é deste processo. Um `404` faria o avaliador procurar erro de digitação no lugar de perceber que abriu a lista da edição passada.
>
> **E6 e E7 não têm código de erro próprio.** Caem no `validationHook`/`mapValidationError` que já existe em `api/src/routes/auth.routes.ts`, que devolve `400` com o `field` correspondente. Um código de domínio para "número fora do intervalo" duplicaria o que o schema Zod já expressa.

---

## 6. Critérios de Aceite

- [ ] Marcar presença duas vezes no mesmo candidato não gera erro nem segunda linha em `candidate_checkins`
- [ ] Desmarcar presença inexistente responde `204`, sem erro
- [ ] `checked_in_by` registra o `sub` do token de quem marcou, e sobrevive ao desmarcar-e-remarcar (com o autor novo)
- [ ] Marcar e desmarcar gravam evento em `checkin_events` com ator, ação e horário
- [ ] **Repetição idempotente (E4/E5) não gera evento** — o log de um duplo toque tem uma linha só
- [ ] Estado e evento são gravados atomicamente: não existe presença sem log, nem log sem a mudança que ele descreve
- [ ] Com a tabela `selection_processes` vazia, a primeira requisição cria a edição de hoje e **é atendida com sucesso** — não falha para só funcionar na segunda
- [ ] Duas requisições simultâneas com a edição inexistente resultam em **uma** linha, e ambas respondem normalmente
- [ ] Depois de a edição existir, nenhuma requisição escreve em `selection_processes`
- [ ] A criação da edição acontece num único ponto do código, não em cada handler
- [ ] O handler `scheduled` não é alterado por esta feature
- [ ] A listagem só devolve candidatos cujo `created_at` cai na janela do processo corrente
- [ ] Busca, filtro de status e paginação são aplicados na mesma consulta, e `total` reflete o conjunto **filtrado**
- [ ] `per_page` acima de 100 é rejeitado com `400`, não silenciosamente reduzido
- [ ] Sem processo corrente, as três rotas respondem `409` — inclusive a listagem
- [ ] Marcar presença de candidato de outra edição responde `409`, não `404`
- [ ] As três rotas exigem `Authorization: Bearer` e negam com `401` sem ele
- [ ] A resposta da listagem **não** inclui `gender` nem `ethnicity`
- [ ] Nenhum tipo de request/response desta feature é declarado fora de `shared/src/schemas`
- [ ] **A migration `0006` não altera nem reconstrói nenhuma tabela existente** — só cria

---

## 7. Fora de Escopo

- **Unicidade de candidato por edição, e a padronização de telefone — as duas juntas, na spec seguinte.** Hoje `candidates.email` e `candidates.phone` são `UNIQUE` globais, então um candidato de 2026.1 não consegue se reinscrever em 2026.2: a FEAT-0001 o barra com `EMAIL_ALREADY_REGISTERED`. E os telefones estão gravados sem formato padronizado. Os dois problemas moram na mesma tabela e exigem o mesmo procedimento caro — reconstruir `candidates` — então serão resolvidos numa reconstrução única. **Isso bloqueia o segundo processo seletivo**, e a spec que resolve precisa existir antes da abertura dele. Ver seção 13.
- **Tela de logs do cadastro para o admin, e o webhook que a alimentaria** — adiadas deliberadamente. **O dado, porém, passa a ser gravado desde já** (`checkin_events`, seção 8.1): a tela pode esperar, a história não, porque só existe o que foi gravado enquanto acontecia. Nenhuma rota de leitura do log entra nesta spec.
- **CRUD de processos seletivos.** A edição corrente é criada sob demanda (seção 4.1.1) e as datas vêm da regra jan–jul / ago–dez. Não há como criar uma edição fora dessa regra, renomear uma existente ou corrigir uma janela pela aplicação — isso continua sendo `UPDATE` manual no D1, e é a razão pela qual editar janela de processo com candidatos é desaconselhado (seção 4.2).
- Check-in por grupo ou sala. `GroupRow`, `GroupCandidateRow` e `GroupEvaluatorRow` já existem em `database.schema.ts` e não são usados aqui: a task pede a lista de todos os inscritos, não a do grupo do avaliador.
- Avaliação do candidato (`EvaluationRow`), que é o passo seguinte ao check-in.
- Registro de horário de saída, presença parcial ou justificativa de ausência. A presença é booleana.

---

## 8. Dados e Modelos

### 8.1 TypeScript Schema

```ts
// Uma edição do processo seletivo. A CIMATEC jr roda um por semestre, e a
// presença precisa ser escopada a um deles — sem isso, a lista do semestre
// novo mostraria os candidatos de todos os anteriores.
//
// As janelas são jan–jul e ago–dez, não dois semestres iguais: é o calendário
// real da tec. Elas não se sobrepõem e cobrem o ano inteiro, o que é o que
// permite resolver o processo corrente por uma comparação de data simples.
//
// Não há coluna `is_active`: o processo corrente é o que contém a data de
// hoje (ver seção 4.1). Uma flag booleana depende de alguém lembrar de
// desligá-la, e o esquecimento seria silencioso.
interface SelectionProcessRow {
  id: string; // UUID v4
  label: string; // "2026.2" — identificador humano, unique
  starts_at: string; // início da janela (inclusive)
  ends_at: string; // fim da janela (inclusive)

  created_at: string;
}

// Presença confirmada — ESTADO ATUAL, não histórico. A existência da linha É
// a presença: não há coluna de estado, e desmarcar apaga a linha. O histórico
// mora em CheckinEventRow, logo abaixo.
//
// `process_id` é redundante com a janela de datas de `candidates.created_at`
// enquanto `candidates` não tiver a própria coluna — mas é ele que mantém
// esta tabela correta por conta própria, e é ele que sobrevive intacto quando
// a spec seguinte adicionar `candidates.process_id`.
interface CandidateCheckinRow {
  id: string; // UUID v4
  candidate_id: string; // FK -> candidates.id
  process_id: string; // FK -> selection_processes.id

  // Quem confirmou. Redundante com o último evento 'marcou' de
  // checkin_events, e mantido assim de propósito: a listagem lê esta tabela a
  // cada página, e derivar o autor do log exigiria uma subquery por linha.
  checked_in_by: string; // FK -> users.id

  checked_in_at: string;
}

// Histórico append-only. Uma linha por mudança REAL de estado (ver 4.3 e 4.4):
// repetições idempotentes não geram evento.
//
// Existe antes da tela que vai consumi-lo porque essa é a única ordem
// possível — a tela de logs do admin pode ser construída a qualquer momento,
// mas só enxerga o que já foi gravado. Nada aqui é lido pelas rotas desta
// spec; é escrita pura, para leitura futura.
type CheckinAction = "marcou" | "desmarcou";

interface CheckinEventRow {
  id: string; // UUID v4
  candidate_id: string; // FK -> candidates.id
  process_id: string; // FK -> selection_processes.id

  action: CheckinAction;
  actor_id: string; // FK -> users.id — o membro que executou a ação

  created_at: string;
}
```

**Pontos de atenção para quem for implementar:**

- **`candidates` não é tocada.** Nenhuma coluna nova, nenhum CHECK novo, nenhum `UNIQUE` alterado, nenhum rebuild. Essa é a diferença entre esta migration e a próxima — e é o que a torna segura.
- **A unicidade da presença é do par, não do candidato.** `UNIQUE (candidate_id, process_id)` é o que permite a mesma pessoa ter presença em 2026.1 e 2026.2 no dia em que a recandidatura for destravada, e é também a constraint em que o `ON CONFLICT DO NOTHING` se apoia (E4). Um `UNIQUE` só em `candidate_id` funcionaria hoje e quebraria depois.
- **`checked_in_by` e `actor_id` usam `ON DELETE RESTRICT`, não `CASCADE`.** Apagar um usuário não pode apagar em silêncio o registro de quem confirmou presença, nem esvaziar o log. Na prática a colisão não deve acontecer: membros saem por `deactivated_at` (FEAT-0003), não por `DELETE`.
- **`checkin_events.action` mantém CHECK no banco.** É um conjunto fechado de dois valores que não tem por que crescer — o oposto de `course`, cujo CHECK foi removido na FEAT-0001 v3.1 justamente por ser um enum que cresce a cada processo seletivo.
- **`checkin_events.candidate_id` usa `CASCADE`.** Este é um log de operação, não trilha de auditoria legal: se um candidato for removido do sistema, linhas de log apontando para um id inexistente não informam nada além de ruído. Vale notar que nenhuma rota do projeto apaga candidatos hoje.
- **Nada nesta spec lê `checkin_events`.** É escrita pura. A tabela existe para que a tela de logs, quando for construída, encontre história — e não é consultada por nenhum dos três fluxos da seção 4.
- **O índice em `candidates(created_at)` não é otimização prematura.** Toda listagem desta feature filtra por essa coluna e ordena por ela, e hoje a tabela não tem índice nenhum além do PK e dos dois `UNIQUE`. `CREATE INDEX` é seguro — não reconstrói a tabela.
- A comparação de janela usa strings ISO-8601 em UTC, consistentes com o `CURRENT_TIMESTAMP` do SQLite que já popula `candidates.created_at`. Comparar `TEXT` em ISO-8601 é ordenação lexicográfica correta — não é preciso converter.
- **Conferir o intervalo dos dados antes de definir o seed.** Rode `SELECT MIN(created_at), MAX(created_at) FROM candidates;` e garanta que as janelas cadastradas cobrem todo esse intervalo. Um candidato fora de todas as janelas fica invisível na listagem — sem erro, sem aviso.

**Migration esperada (`0006-candidate-checkin.sql`), em esboço:**

```sql
CREATE TABLE selection_processes (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE candidate_checkins (
  id            TEXT PRIMARY KEY,
  candidate_id  TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id    TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  checked_in_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checked_in_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (candidate_id, process_id)
);

CREATE TABLE checkin_events (
  id           TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id   TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('marcou', 'desmarcou')),
  actor_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_candidate_checkins_process ON candidate_checkins(process_id);
CREATE INDEX idx_candidates_created_at      ON candidates(created_at);
CREATE INDEX idx_checkin_events_process     ON checkin_events(process_id, created_at);
CREATE INDEX idx_checkin_events_candidate   ON checkin_events(candidate_id);

-- Seed das edições já decorridas/corrente. As seguintes nascem sob demanda
-- (seção 4.1.1) — este INSERT existe para cobrir 2026.1, que já passou e que
-- a criação automática nunca geraria, já que ela só olha para a data de hoje.
INSERT INTO selection_processes (id, label, starts_at, ends_at) VALUES
  ('<uuid-1>', '2026.1', '2026-01-01', '2026-07-31 23:59:59'),
  ('<uuid-2>', '2026.2', '2026-08-01', '2026-12-31 23:59:59');
```

> **Esta migration só cria.** Nenhum `ALTER TABLE`, nenhum `DROP`, nenhuma tabela reconstruída — o mesmo perfil de segurança da `0005-member-auth.sql`, e o oposto do da `0004`. Não precisa de `MAINTENANCE_MODE`.
>
> **A migration seguinte não terá essa sorte.** Ela vai reconstruir `candidates` para trocar os `UNIQUE` e padronizar os telefones, e aí valem integralmente as advertências do cabeçalho da `0004`: `DROP TABLE candidates` com foreign keys ativas apaga todas as inscrições via CASCADE, `PRAGMA foreign_keys = OFF` não existe no D1, `defer_foreign_keys` não impede o CASCADE, e o `foreign_key_check` posterior volta limpo — reportando sucesso sobre um banco destruído. É por isso que as duas mudanças foram agrupadas: uma exposição, não duas.
>
> Como toda migration do projeto, **sem `BEGIN`/`COMMIT` explícitos**, que o D1 rejeita.

### 8.2 Query Params

**`GET /candidates`**

| Param      | Tipo   | Default | Regra                                              |
| ---------- | ------ | ------- | -------------------------------------------------- |
| `page`     | número | `1`     | inteiro ≥ 1                                        |
| `per_page` | número | `25`    | inteiro entre 1 e 100                              |
| `search`   | texto  | —       | comparação parcial e case-insensitive sobre `name` |
| `status`   | enum   | `todos` | `todos` \| `presentes` \| `ausentes`               |

> **`per_page` acima de 100 é `400`, não um clamp silencioso.** Reduzir o valor sem avisar faz o cliente pedir 500 itens, receber 100, e paginar errado achando que recebeu tudo. O erro é mais barato que a divergência.
>
> A busca é só por `name`. Não há CPF nem matrícula em `CandidateRow`, e buscar por email na porta do evento é mais lento do que digitar o nome. Buscar por telefone seria pior ainda enquanto o formato não estiver padronizado (seção 7).

### 8.3 Response — Sucesso

**`GET /candidates` (`200 OK`)**

```json
{
  "data": {
    "process": { "id": "uuid", "label": "2026.2" },
    "items": [
      {
        "id": "uuid",
        "name": "string",
        "email": "string",
        "phone": "string",
        "course": "eng-computacao",
        "semester": 5,
        "checkedInAt": "timestamp | null"
      }
    ],
    "pagination": { "page": 1, "perPage": 25, "total": 137, "totalPages": 6 }
  }
}
```

> **`checkedInAt` é o estado.** Não há campo booleano `present` além dele: dois campos para o mesmo fato divergem na primeira vez que alguém atualizar um e esquecer o outro. `null` significa ausente.
>
> **`gender` e `ethnicity` não estão na resposta, e é decisão, não esquecimento.** São dados sensíveis, coletados na inscrição para fins estatísticos, e esta tela é aberta num celular na porta de um evento, com gente olhando por cima do ombro. Nada no check-in precisa deles.
>
> **`phone` sai do banco como está**, sem formato garantido (seção 7). A UI que precisar exibi-lo formatado terá que lidar com isso até a padronização acontecer.
>
> `process` vem na resposta para a UI conseguir dizer de qual edição é a lista sem uma segunda chamada.

**`PUT /candidates/{id}/checkin` (`200 OK`)**

```json
{
  "data": { "candidateId": "uuid", "checkedInAt": "timestamp" }
}
```

> Devolve o estado resultante, não o efeito. Em E4 (presença já confirmada), `checkedInAt` é o da confirmação **original** — quem chegou primeiro é quem fica registrado.

**`DELETE /candidates/{id}/checkin` (`204 No Content`)** — sem corpo.

### 8.4 Response — Erros

Segue o envelope já padronizado em `shared/src/schemas/error.schema.ts` (`{ error: { code, message, field? } }`). Códigos previstos, na convenção de `CandidateErrorCode` e `AuthErrorCode`:

| `code`                            | Cenário | HTTP |
| --------------------------------- | ------- | ---- |
| `CANDIDATE_NOT_FOUND`             | E1      | 404  |
| `NO_ACTIVE_SELECTION_PROCESS`     | E2      | 409  |
| `CANDIDATE_NOT_IN_ACTIVE_PROCESS` | E3      | 409  |
| `INSUFFICIENT_ROLE`               | E9      | 403  |

> E6 e E7 usam o erro de validação genérico com `field`; E8 reaproveita `INVALID_TOKEN`/`TOKEN_EXPIRED` de `AuthErrorCode`; E10 usa `MAINTENANCE_MODE`, já emitido pelo `maintenanceGuard`. Nenhum deles precisa de código novo.
>
> `INSUFFICIENT_ROLE` é o primeiro código de autorização do projeto e não pertence a esta feature — ele nasce aqui porque o middleware nasce aqui, mas mora em `AuthErrorCode`, junto dos demais códigos de acesso.

---

## 9. Requisitos Técnicos Definidos

| Requisito              | Decisão                                                                                                                                                   | Justificativa                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Escopo da migration    | **Puramente aditiva.** `CREATE TABLE`, `CREATE INDEX` e o seed — nada mais                                                                                | Reconstruir `candidates` é a operação de maior risco do banco. Ela vai acontecer uma vez, na spec seguinte, resolvendo `UNIQUE` por edição e padronização de telefone juntos. Fazer aqui seria expor as inscrições ao mesmo procedimento duas vezes                                                                |
| Criação da edição      | **Sob demanda, na resolução do processo corrente**, idempotente via `ON CONFLICT (label) DO NOTHING`. Sem tarefa agendada                                  | Depender de alguém lembrar de um `INSERT` em 1º de janeiro é um modo de falha anual e previsível — e derruba o check-in inteiro, não uma funcionalidade lateral. Fazer no cron resolveria igual, ao custo de uma quarta responsabilidade num handler que já acumula três e cujo erro só aparece no painel da Cloudflare |
| Escrita no caminho de leitura | **Aceita**, e limitada à primeira requisição de cada semestre                                                                                        | É o único incômodo real do desenho: um `GET` que escreve. Em troca, a edição existe exatamente quando alguém precisa dela, sem defasagem de até 1h (produção) ou 12h (staging) que uma tarefa agendada introduziria na virada do ano                                                                               |
| Corrida na criação     | Resolvida pelo `UNIQUE` de `label` + releitura, não por lock                                                                                               | Dois avaliadores abrindo a tela no mesmo segundo disparam dois `INSERT`; um vence e o outro vira no-op. Sem o `UNIQUE`, a edição existiria duplicada e a presença se dividiria entre as duas linhas sem nenhum erro visível                                                                                        |
| Histórico do check-in  | **Tabela `checkin_events` append-only**, uma linha por mudança real de estado — não soft delete em `candidate_checkins`                                    | Soft delete quebraria o `UNIQUE (candidate_id, process_id)` (viraria índice parcial) e obrigaria todo `SELECT` a lembrar de `WHERE revoked_at IS NULL` — esquecer uma vez produz presença fantasma na lista. Tabela separada mantém o caminho de leitura, que é o quente, sem nenhuma condição extra                |
| Atomicidade estado + evento | Um `D1Database.batch` por operação                                                                                                                    | Mesmo mecanismo da FEAT-0001 para candidato + inscrição. Um log que discorda do estado afirma com confiança algo que não aconteceu — é pior que log nenhum                                                                                                                                                        |
| Vínculo candidato ↔ edição | Inferido por `created_at` dentro da janela do processo                                                                                                    | Dívida assumida enquanto `candidates` não tiver `process_id`. Custo conhecido: editar a janela de um processo remaneja retroativamente quem pertence a ele                                                                                                                                                        |
| Prefixo das rotas      | **`/candidates`** (plural), separado de `/candidate` (singular, público)                                                                                   | O prefixo público usa `cors()` refletindo qualquer origin, o que é correto para a inscrição anônima e inaceitável numa rota que devolve email e telefone de candidatos. Prefixos distintos permitem middlewares distintos                                                                                          |
| CORS do prefixo novo   | Allowlist de `FRONT_ORIGIN`, com `Authorization` em `allowHeaders`. **`allowMethods` precisa ganhar `PUT` e `DELETE`** — hoje é `["GET","POST","OPTIONS"]` | Sem `PUT`/`DELETE` na lista, o preflight reprova as duas rotas de escrita e o sintoma aparece no navegador como falha de CORS, não como erro da API                                                                                                                                                               |
| Modo de manutenção     | Registrar o `maintenanceGuard` também em `/candidates/*`                                                                                                  | O guard é opt-in por prefixo. A FEAT-0002, E7, existe porque o cron escapou dele — um prefixo novo escaparia igual                                                                                                                                                                                                |
| Autorização            | Novo `requireRole(...)` em `api/src/middlewares/require-role.ts`, composto **depois** de `requireAuth`, aplicado como `requireRole(ADMIN, AVALIADOR)`      | `requireAuth` só valida o token e deliberadamente não olha `role` (FEAT-0003). Hoje o conjunto permitido é o total de papéis existentes e o middleware não barra ninguém — ele existe para que a próxima rota exclusiva de admin não precise inventá-lo, e para que a permissão seja explícita na definição da rota |
| Idempotência da marcação | `INSERT ... ON CONFLICT (candidate_id, process_id) DO NOTHING`, seguido da leitura do estado atual                                                          | Resolve E4 no banco, sem `SELECT`-antes-de-`INSERT`, que teria janela de corrida entre dois avaliadores                                                                                                                                                                                                           |
| Paginação              | Offset (`LIMIT`/`OFFSET`) com `COUNT(*)` do conjunto filtrado, na mesma requisição                                                                          | O cliente precisa de `total` para os contadores e para saber quantas páginas existem — keyset não fornece nenhum dos dois. Com centenas de linhas, o custo do `COUNT` é irrelevante                                                                                                                               |
| Busca                  | `LIKE` com wildcards nas duas pontas, sem índice de texto                                                                                                  | Um `LIKE '%x%'` não usa índice, mas a base é de centenas de linhas e tempo de D1 é **I/O**, que não conta contra o teto de 10 ms de CPU do plano Free (`CONTEXT.md`)                                                                                                                                               |
| Ordenação              | `created_at ASC, id ASC`                                                                                                                                   | Mesma tupla já usada em `CandidateRepository.listAllWithApplication()`. O `id` desempata para a paginação não repetir nem pular linhas com `created_at` idêntico                                                                                                                                                  |
| Convenção de paginação | `PaginationQuerySchema` e `PaginationMetaSchema` em `shared/src/schemas/pagination.schema.ts`, genéricos                                                     | Este é o primeiro endpoint paginado do projeto. Nascer específico da feature garantiria uma segunda convenção divergente no segundo endpoint                                                                                                                                                                      |
| Camadas                | `checkin.routes.ts` / `checkin.service.ts` / `checkin.repository.ts`, com o service devolvendo `Either`                                                     | `api/.agents/architecture/SKILL.md`. A listagem mora em `checkin.*` e não em `candidates.*` porque sua forma inteira — processo corrente, estado de presença, filtro por status — pertence a esta feature, não ao cadastro                                                                                         |

---

## 10. Perguntas Esclarecidas / Em Aberto

| #   | Pergunta                                                            | Resposta                                                                                                                                                                                                                                                                                                               | Decidido em |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Qual o `label` e a janela dos processos seletivos?                  | **Janeiro a julho e agosto a dezembro**, rotulados `AAAA.1` e `AAAA.2`. As janelas não se sobrepõem e cobrem o ano inteiro, o que garante que sempre há exatamente um processo corrente                                                                                                                                 | 2026-08-11  |
| 2   | Como o processo seguinte é criado, já que não há CRUD?              | **Sob demanda, na resolução do processo corrente** (seção 4.1.1), de forma idempotente. Descartados o `INSERT` manual — tarefa anual que ninguém executa é tarefa que não existe — e a tarefa agendada, que resolveria o mesmo problema ao custo de uma responsabilidade a mais no cron e de defasagem na virada do ano. Em troca, a regra jan–jul / ago–dez passa a viver também em código, e não há mais como ter o sistema sem edição corrente — ver seções 4.1.1 e 13 | 2026-08-11  |
| 3   | Desmarcar presença deve deixar rastro para a futura tela de logs?   | **Sim, em `checkin_events`.** Não por soft delete, que contaminaria toda leitura com `WHERE revoked_at IS NULL`, mas por tabela append-only escrita junto com a mudança de estado. A tela e o webhook seguem fora de escopo (seção 7) — o que não podia esperar era o dado, porque histórico não gravado não se recupera | 2026-08-11  |
| 4   | O check-in deve ser restrito ao grupo/sala do avaliador?            | **Não.** A task pede explicitamente a lista de todos os inscritos. Restringir por grupo exigiria que os grupos já estivessem montados no momento do check-in, e na porta do evento eles ainda não estão                                                                                                                 | 2026-08-11  |
| 5   | Um avaliador pode desmarcar a presença confirmada por outro?        | **Sim.** "Qualquer avaliador pode confirmar" implica que qualquer um pode corrigir — restringir o desmarcar ao autor original transformaria um toque errado num pedido de ajuda no grupo do WhatsApp                                                                                                                    | 2026-08-11  |
| 6   | O que acontece com a presença quando o processo corrente termina?   | **Nada.** As linhas ficam, escopadas ao `process_id`. A listagem simplesmente para de enxergá-las quando a janela muda                                                                                                                                                                                                  | 2026-08-11  |
| 7   | A listagem deveria devolver o contador de presentes/ausentes?       | Não nesta versão — `total` reflete o conjunto filtrado, então o cliente obtém as duas contagens filtrando por `status`. Um contador dedicado entra se a UI passar a exibi-lo sem filtrar                                                                                                                                | 2026-08-11  |
| 8   | A unicidade de email/telefone por edição entra nesta spec?          | **Não.** Ela exige reconstruir `candidates`, e a mesma tabela tem outra dívida esperando — telefones sem padronização. Duas reconstruções da tabela mais perigosa do banco para resolver dois problemas é dobrar a exposição sem necessidade. As duas vão juntas na spec seguinte, que **precede a abertura do segundo processo seletivo** | 2026-08-11  |
| 9   | Um candidato pode ser movido de um processo seletivo para outro?    | **Não nesta versão** (seção 7). O caso real — alguém que se inscreveu no fim de julho e só compareceu em agosto — existe, mas hoje ele nem é representável: sem `candidates.process_id`, "mover" significaria alterar `created_at`, o que é falsificar o registro                                                        | 2026-08-11  |

---

## 11. Dependências Externas

- **Nenhuma.** As três rotas dependem apenas do D1 e do `JWT_SECRET` já existente (FEAT-0003). Nenhum provedor externo, nenhuma fila, nenhum binding novo em `wrangler.jsonc`.

**Limites do plano Free relevantes para esta feature:**

| Recurso           | Limite (Free)        | Impacto aqui                                                                                                                                   |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU por invocação | 10 ms                | Irrelevante. Não há criptografia nestas rotas, e tempo de D1 é I/O                                                                              |
| Escrita no D1     | 100.000 linhas/dia   | Folgado — **duas** linhas por mudança de estado (presença + evento), algumas centenas de cliques por processo seletivo                          |
| Leitura no D1     | 5.000.000 linhas/dia | Folgado, mas é a métrica que a listagem consome: cada página lê `per_page` linhas mais o `COUNT`, e a tela recarrega a cada marcação             |
| Rate Limiting WAF | 1 regra              | A regra existente cobre `POST` em `/auth/*`. Estas rotas ficam **sem** rate limit — aceitável, porque exigem token válido para chegar ao Worker  |

---

## 12. Métricas de Sucesso

> Sugestões para discutir com o time:
>
> - Nenhuma consulta manual ao D1 para saber quem compareceu (é o problema que motivou a feature)
> - Proporção de `DELETE` sobre `PUT` — se muitos check-ins são desfeitos, o alvo de toque da UI está errado, não o avaliador
> - Tempo entre o primeiro e o último check-in de um processo, como proxy da duração real do credenciamento
> - Número de candidatos que aparecem na lista e nunca são marcados, comparado com a ausência real registrada à mão

---

## 13. Notas e Observações

- 🔴 **A recandidatura continua bloqueada, e isso tem prazo.** `candidates.email` e `candidates.phone` são `UNIQUE` globais, então ninguém que se inscreveu em 2026.1 consegue se inscrever em 2026.2 — a FEAT-0001 responde `EMAIL_ALREADY_REGISTERED`. Esta spec **não** resolve isso, deliberadamente: a correção exige reconstruir `candidates`, e essa reconstrução foi agrupada com a padronização de telefone numa spec seguinte, para acontecer uma vez só. A consequência é que existe uma spec no caminho crítico do segundo processo seletivo, e a hora de escrevê-la não é na semana da inscrição.
- **Agrupar as duas mudanças de schema é a decisão de maior valor desta versão, e ela é sobre risco, não sobre esforço.** Reconstruir `candidates` não é caro de escrever — o procedimento está pronto na `0004`. É caro de errar: `DROP TABLE candidates` com foreign keys ativas apaga as inscrições via CASCADE, e o `foreign_key_check` posterior volta limpo, de modo que a migration reporta sucesso sobre um banco destruído. Cada execução desse procedimento é uma aposta; fazer duas apostas para resolver dois problemas da mesma tabela é escolha ruim quando uma resolve os dois.
- **O vínculo do candidato com a edição é inferido, não afirmado, e isso tem um efeito colateral concreto:** corrigir a janela de um processo já em uso remaneja retroativamente quem pertence a ele, silenciosamente. Enquanto `candidates.process_id` não existir, tratar as datas de um processo com candidatos como imutáveis.
- **Esta spec define quem pode o quê, e a resposta hoje é "todo mundo que está logado".** O `requireRole` não barra ninguém: só existem `admin` e `avaliador`, e ambos podem tudo aqui. Ele entra mesmo assim porque a alternativa é a próxima rota — provavelmente a de administração — precisar inventar o middleware sob pressão, e porque uma rota que declara `requireRole(ADMIN, AVALIADOR)` documenta a permissão no lugar onde ela é lida.
- **Separar estado de histórico foi o que permitiu ter os dois sem pagar por nenhum.** `candidate_checkins` continua sendo a tabela mais simples possível — a linha existe ou não existe — e por isso a listagem, que é o caminho quente, segue sendo um `LEFT JOIN` sem cláusula de revogação. O histórico foi para `checkin_events`, onde crescer é inofensivo porque ninguém lê no caminho crítico. A alternativa (soft delete) teria misturado as duas responsabilidades numa tabela só, ao custo de um `WHERE revoked_at IS NULL` que toda consulta futura precisaria lembrar de escrever — e a primeira que esquecesse produziria presença fantasma na lista.
- **Gravar o log antes de existir a tela que o lê é a única ordem possível.** A tela de logs pode ser construída em qualquer momento e vai funcionar; o que ela não consegue é inventar o que aconteceu antes de a gravação começar. É o mesmo raciocínio de `checked_in_by`, e é por isso que os dois entram nesta spec apesar de nenhum ser lido por ela.
- 🟡 **A regra jan–jul / ago–dez agora vive em dois lugares:** nas linhas semeadas pela migration e no código que cria as próximas. Se o calendário da tec mudar, não basta um `UPDATE` — é deploy, mais correção das linhas que o sistema já tiver criado com a regra antiga. Foi o preço de tirar o humano do caminho, e é a razão pela qual essa geração ficou concentrada num ponto só em vez de espalhada pelo service.
- 🟡 **Criar a edição sob demanda significa que um `GET` escreve no banco, e vale saber por que isso foi aceito.** A escrita acontece no máximo uma vez por semestre, é idempotente, e não muda a resposta que o cliente recebe. A alternativa considerada foi uma tarefa no Cron Trigger — igualmente automática, sem escrita em verbo de leitura, mas com duas desvantagens concretas: uma quarta responsabilidade num handler que já acumula três, e uma defasagem de até 1 hora em produção ou 12 em staging entre a virada do ano e a criação da linha, durante a qual o check-in ficaria caído. Sob demanda, a edição existe no instante em que alguém precisa dela.
- **A consequência menos óbvia é que o sistema perdeu o estado "sem processo seletivo".** Antes, apagar a linha era uma forma de desligar o check-in; agora a próxima requisição a recria. Quem precisar congelar a operação usa `MAINTENANCE_MODE`, que é o instrumento desenhado para isso e responde `503` com mensagem, em vez de um `409` que parece defeito.
- **A presença não tem hora de saída.** Um candidato que faz check-in e vai embora antes da dinâmica aparece como presente. Isso é aceito: o dado existe para o avaliador saber quem está na sala no momento do credenciamento, não para calcular permanência.
- **O `checked_in_by` não é exibido em lugar nenhum desta feature.** Ele é gravado porque gravá-lo agora custa uma coluna, e reconstruí-lo depois custa a informação inteira. É o oposto da decisão sobre o histórico do desmarcar — e a assimetria é proposital: guardar quem marcou é uma coluna, guardar o histórico completo é um modelo de dados diferente.
