# SPEC — Espelho das inscrições em planilha do Google

ID: FEAT-0002
Módulo: Inscrição de candidatos / operação do processo seletivo
Versão: 1.0
Data: 2026-08-04
Status: DRAFT

> **Contexto:** o time que opera o processo seletivo não tem interface para ver quem se inscreveu. Hoje a única forma de consultar as inscrições é rodar SQL no D1. Esta feature cria um **espelho somente-leitura** das inscrições numa planilha do Google, atualizado periodicamente por um Cron Trigger do Worker.
>
> **O que esta feature deliberadamente não é:** ela não toca no fluxo de inscrição. `POST /candidate/register` continua exatamente como está — mesma latência, mesmas dependências (só o D1), mesmos modos de falha. A sincronização é um processo separado, e sua falha é invisível para o candidato. Essa separação é o requisito central, não um detalhe de implementação (ver seção 9).

---

## 1. Objetivo

Dar ao time do processo seletivo uma visão tabular e compartilhável das inscrições, sem exigir acesso ao banco e sem construir um painel administrativo.

O Worker passa a rodar periodicamente uma rotina que lê as inscrições do D1, compara com o que já está na planilha e acrescenta as que faltam. A planilha é um **espelho**: o D1 continua sendo a única fonte da verdade.

**Fora do escopo desta spec:** painel administrativo, edição de inscrição pela planilha, avaliação de candidatos, e qualquer escrita da planilha de volta para o banco.

---

## 2. Atores

- **Ator primário:** membro do time do processo seletivo (consumidor da planilha — nunca interage com o sistema, só lê)
- **Ator secundário:** o próprio Worker, executando via Cron Trigger (não há gatilho humano)

**Restrição:** o candidato não participa deste fluxo e não tem como percebê-lo. Nenhuma resposta de API muda.

---

## 3. User Story

```gherkin
Como membro do time do processo seletivo,
Eu quero ver as inscrições numa planilha do Google atualizada sozinha,
Para eu poder acompanhar, filtrar e compartilhar os inscritos
sem precisar de acesso ao banco de dados.
```

---

## 4. Fluxo Principal (Happy Path)

### 4.1 Execução agendada

1. O Cron Trigger dispara o handler `scheduled` do Worker no intervalo configurado (seção 9).
2. O sistema verifica o modo de manutenção. Se `MAINTENANCE_MODE` estiver `"true"`, a execução é **encerrada sem ler nem escrever nada** (ver E7).
3. O sistema obtém um access token do Google, assinando um JWT com a chave privada da service account e trocando-o no endpoint de token do Google.
4. O sistema valida o cabeçalho da planilha (ver E4). Se não conferir, aborta sem escrever e sem ler mais nada.
5. O sistema lê da planilha a coluna de identificadores da aba de inscrições, obtendo o conjunto de ids já espelhados.
6. O sistema lê do D1 todas as inscrições (candidato + questionário, via join).
7. O sistema calcula a diferença: inscrições cujo `id` não está no conjunto lido no passo 5.
8. Se a diferença for vazia, a execução termina aqui, registrando em log que nada havia a fazer.
9. O sistema acrescenta as linhas faltantes ao fim da aba, ordenadas por data de inscrição crescente, no formato da seção 8.
10. O sistema registra em log quantas linhas foram acrescentadas.

> **Por que diff em vez de estado:** o job não guarda em lugar nenhum quais candidatos já foram enviados. Ele descobre isso lendo a própria planilha a cada execução. Três consequências, todas desejáveis:
>
> - **Nenhuma migration.** Não é preciso adicionar coluna em `candidates` nem criar tabela de controle — e reconstruir `candidates` é uma operação de risco documentada (`CONTEXT.md`, migration 0004).
> - **Idempotência natural.** Rodar duas vezes seguidas não duplica nada. Uma execução interrompida no meio é corrigida na seguinte.
> - **Auto-recuperação.** Se alguém apagar uma linha da planilha por engano, ela reaparece na próxima execução. O outro lado dessa moeda está em E8.

---

## 5. Fluxos Alternativos e Erros

Nenhum erro desta seção é visível para o candidato ou para qualquer requisição HTTP. Todos terminam da mesma forma: log de erro e encerramento da execução. **O próximo tick do cron é o mecanismo de retry** — não há backoff, fila ou dead letter.

| #   | Cenário                                   | Condição                                                                             | Ação                                                                                    |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| E1  | Falha na autenticação com o Google        | chave privada inválida, malformada ou revogada; relógio fora de sincronia            | abortar sem escrever; log em nível `error` distinguindo falha de auth de falha de escrita |
| E2  | Quota da API excedida                     | resposta `429` do Google                                                             | abortar; a próxima execução tenta de novo                                                 |
| E3  | Planilha inacessível                      | resposta `403`/`404` — planilha não compartilhada com a service account, id errado, ou planilha excluída | abortar; log em nível `error` — **é erro de configuração, não transitório**, e vai se repetir a cada execução até alguém corrigir |
| E4  | Cabeçalho ou aba divergente               | a aba esperada não existe, ou a primeira linha não corresponde ao cabeçalho da seção 8.2 | abortar **sem escrever nenhuma linha**                                                    |
| E5  | Falha de leitura do D1                    | erro na query                                                                        | abortar; deixar o erro subir para a observabilidade do Worker                              |
| E6  | Escrita parcial                           | a chamada de append falha depois de gravar parte das linhas                          | não compensar; a próxima execução recalcula o diff e completa o que faltou                 |
| E7  | Modo de manutenção ativo                  | `MAINTENANCE_MODE === "true"`                                                        | encerrar imediatamente sem ler o banco (ver nota abaixo)                                   |
| E8  | Linha apagada manualmente na planilha     | alguém remove uma inscrição da planilha                                              | a linha é reinserida na próxima execução, no fim da aba                                    |

> **Por que E4 aborta em vez de corrigir:** escrever em posição errada numa planilha compartilhada é o único dano irreversível que este job consegue causar — a API não tem desfazer, e o histórico de versões do Google Sheets é a única recuperação. Diante de qualquer sinal de que a planilha não é a esperada, não escrever é sempre mais barato que escrever errado.
>
> **Por que E7 existe:** `MAINTENANCE_MODE` foi criado para fechar a janela de escrita durante migrations que reconstroem tabelas. Nessas janelas o schema de `candidates` está em estado transitório. O bloqueio atual é um middleware em `/candidate/*` e **não alcança o handler agendado** — sem esta verificação explícita, o cron seria a única coisa lendo o banco no meio de uma migration.

---

## 6. Critérios de Aceite

- [ ] Toda inscrição gravada no D1 aparece na planilha em no máximo um intervalo de cron
- [ ] Nenhuma inscrição aparece duplicada, mesmo com execuções repetidas ou sobrepostas
- [ ] A ordem das colunas da planilha corresponde exatamente à seção 8.2
- [ ] Curso, gênero, cor/etnia e origem são exibidos por extenso, nunca como slug
- [ ] Uma falha em qualquer etapa da sincronização não afeta `POST /candidate/register` de forma alguma
- [ ] Nenhuma linha é escrita quando o cabeçalho da planilha não confere (E4)
- [ ] A execução é encerrada sem tocar no banco quando `MAINTENANCE_MODE === "true"` (E7)
- [ ] Staging e produção escrevem em planilhas diferentes
- [ ] A chave privada da service account não aparece em nenhum arquivo versionado, log ou mensagem de erro
- [ ] Rodar o job com a planilha já em dia não escreve nada e registra isso em log

---

## 7. Fora de Escopo

- Escrita na direção planilha → banco (a planilha é somente leitura para o time; edições nela não voltam para lugar nenhum)
- Atualização de linhas já espelhadas — o job só acrescenta. Como a aplicação nunca faz `UPDATE` em inscrições hoje, uma linha nunca fica desatualizada. Se edição de inscrição existir um dia, esta spec precisa ser revista
- Remoção de linhas da planilha quando um candidato é excluído do banco
- Formatação, fórmulas, filtros ou abas derivadas — o job escreve valores; qualquer apresentação é responsabilidade de quem usa a planilha
- Notificação ativa de falha (email/Slack). A falha é observável via logs do Worker; alertar é trabalho futuro
- Sincronização em tempo real. Foi avaliada e descartada — ver seção 10, pergunta 1

---

## 8. Dados e Modelos

### 8.1 Contratos compartilhados

Esta feature **não introduz nenhum contrato novo em `shared/src/schemas`**. O mapeamento inscrição → linha da planilha é interno da API: o front não sabe que a planilha existe, e nenhum payload de request/response muda. O formato de linha vive em `api/`, não em `shared/`.

O que ela **consome** de `shared`:

| Item                                                    | Uso                                                       |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `CandidateRow`, `CandidateApplicationRow`               | tipagem da leitura do D1                                   |
| `COURSE_LABELS` (`shared/src/schemas/candidate.schema.ts`) | rótulo por extenso do curso                             |

O que ela **exige que seja adicionado** a `shared/src/schemas/candidate.schema.ts`:

| Item                       | Situação atual                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ |
| `GENDER_LABELS`            | existe apenas em `front/app/inscricao/_components/candidate-registration-form.tsx` |
| `ETHNICITY_LABELS`         | existe apenas em `front/app/inscricao/_components/availability-step-form.tsx`      |
| `REFERRAL_SOURCE_LABELS`   | existe apenas em `front/app/inscricao/_components/referral-step-form.tsx`         |

> Os três devem ser movidos para `shared`, ao lado de `COURSE_LABELS` e pelo mesmo motivo já registrado no comentário daquele mapa: *o slug é o que trafega e é persistido, o rótulo é o texto que o usuário lê, e todo consumidor deve ler o mesmo mapa*. Sem isso, esta feature seria a segunda cópia de cada um. O front passa a importá-los de `shared` em vez de declará-los localmente. Como são mapas de exibição do vocabulário do domínio — e não payload de request/response — a regra de ouro dos contratos é respeitada: eles são compartilhados justamente para não divergirem.
>
> Cada mapa deve ser tipado como `Record<T, string>` sobre o tipo do enum, para que o compilador cobre a entrada nova sempre que um valor for adicionado. É o que `COURSE_LABELS` já faz.

### 8.2 Formato da linha

Aba: **`Inscricoes`**. Uma linha por inscrição. A primeira linha é o cabeçalho, criado no setup e validado a cada execução (E4).

| Col. | Cabeçalho                | Origem                                                        | Formato                                            |
| ---- | ------------------------ | ------------------------------------------------------------- | -------------------------------------------------- |
| A    | `id`                     | `candidates.id`                                               | UUID v4 — **chave do diff, nunca alterar**         |
| B    | `Data de inscrição`      | `candidates.created_at`                                       | `YYYY-MM-DD HH:MM:SS` (UTC, ver nota)              |
| C    | `Nome`                   | `candidates.name`                                             | texto                                              |
| D    | `Email`                  | `candidates.email`                                            | texto                                              |
| E    | `Telefone`               | `candidates.phone`                                            | texto, exatamente como o candidato digitou         |
| F    | `Curso`                  | `candidates.course`                                           | rótulo de `COURSE_LABELS`                          |
| G    | `Semestre`               | `candidates.semester`                                         | número de 1 a 10                                   |
| H    | `Gênero`                 | `candidates.gender`                                           | rótulo de `GENDER_LABELS`                          |
| I    | `Cor/Etnia`              | `candidates.ethnicity`                                        | rótulo de `ETHNICITY_LABELS`                       |
| J    | `Como conheceu`          | `candidate_applications.referral_source`                      | rótulo de `REFERRAL_SOURCE_LABELS`                 |
| K    | `Como conheceu (descrição)` | `candidate_applications.referral_source_other`             | texto; célula vazia quando `null`                  |
| L    | `Experiências e skills`  | `candidate_applications.experience`                           | texto livre, até 1000 caracteres                   |
| M    | `Motivação`              | `candidate_applications.motivation`                           | texto livre, até 500 caracteres                    |
| N    | `Restrição aos sábados`  | `candidate_applications.saturday_restriction`                 | `Sim` / `Não`                                      |
| O    | `Necessidades especiais` | `candidate_applications.special_needs`                        | `Sim` / `Não`                                      |

**Regras do formato:**

- **Colunas novas entram no fim.** Reordenar ou inserir no meio quebra as linhas já escritas, que não são reescritas.
- **Booleanos viram `Sim`/`Não`.** O D1 guarda `0`/`1`; a planilha é lida por pessoas.
- **`mej_acknowledged` é omitido de propósito.** É sempre `true` — uma inscrição não existe sem ele. A coluna teria zero informação.
- **`created_at` vai como texto cru**, no formato que o SQLite devolve (`YYYY-MM-DD HH:MM:SS`, sem `T`/`Z`), que é UTC. Não converter para horário de Brasília no job: a conversão pertence a quem lê a planilha, e uma data escrita como texto sobrevive a qualquer configuração de locale da planilha. Isso já está registrado em `RegisterResponseSchema`, onde o mesmo valor é tipado como string simples de propósito.
- **Escrever como valores literais, nunca como fórmula.** Um campo de texto livre que comece com `=` seria interpretado como fórmula pela planilha. A escrita deve usar o modo de entrada que trata tudo como texto.

---

## 9. Requisitos Técnicos Definidos

| Requisito                            | Decisão                                                                                                     | Justificativa                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gatilho                              | **Cron Trigger** do Worker, a cada **1 hora** (`0 * * * *`)                                                           | Desacopla a sincronização do request do candidato. O intervalo é ajustável e não muda nada além da configuração                                                    |
| Acoplamento com `POST /candidate/register` | **Nenhum.** Nem uma linha do fluxo de inscrição é alterada                                            | A v3.0 da FEAT-0001 removeu toda dependência externa do caminho da inscrição justamente por confiabilidade. Escrever na planilha durante o request reintroduziria exatamente o que foi eliminado |
| Controle do que já foi enviado       | **Diff contra a própria planilha**, sem estado persistido                                                   | Evita migration em `candidates` (operação de risco no D1, ver `CONTEXT.md`), torna o job idempotente e auto-recuperável                                            |
| Fonte da verdade                     | **D1, sempre.** A planilha é espelho descartável                                                            | A planilha pode ser recriada do zero a qualquer momento apagando a aba e deixando o job rodar. O inverso não existe                                                |
| Autenticação no Google               | **Service account** com JWT assinado em RS256 via WebCrypto, trocado por access token                       | É o único modelo de auth do Google que funciona sem interação humana. O SDK oficial (`googleapis`) depende de módulos nativos do Node e não é adequado ao runtime dos Workers |
| Cache do access token                | **Não fazer.** Obter um token novo a cada execução                                                          | O token dura 1h, mesma ordem de grandeza do intervalo do cron, e o custo é um round-trip por execução. Cachear exigiria reintroduzir o KV, removido do projeto na v3.0 — complexidade maior que o ganho |
| Chave privada                        | Secret do Worker (`wrangler secret put`), por ambiente. Nunca em `vars`, nunca no repositório               | Mesmo tratamento de `DOCS_PASSWORD`. O `wrangler.jsonc` é versionado                                                                                               |
| Id da planilha                       | Var em `wrangler.jsonc`, **valor diferente em produção e em `env.staging`**                                 | Não é segredo (a permissão vem do compartilhamento, não do id), e versionar deixa explícito qual ambiente escreve onde. Definir por `--var` no deploy manual não funciona: o CD por push sobrescreve (`CONTEXT.md`) |
| Configuração do cron por ambiente    | Bloco de triggers declarado **na raiz e também dentro de `env.staging`**                                    | Ambientes do Wrangler não herdam a configuração da raiz — é por isso que `assets`, `d1_databases` e `vars` já aparecem duplicados no arquivo. Um trigger só na raiz não existiria em staging |
| Estrutura do entry point             | O `export default` do Worker passa a expor **`fetch` e `scheduled`**                                        | Hoje o arquivo exporta a instância do Hono diretamente. Um Worker com cron precisa expor os dois handlers; o `fetch` continua sendo o do Hono, sem alteração de comportamento |
| Camadas                              | Cliente HTTP do Google em `api/src/lib/`; orquestração em `api/src/services/`; leitura do D1 em `api/src/repositories/candidates.repository.ts` | Mesma separação já usada pelo fluxo de inscrição (`api/.agents/architecture/SKILL.md`): o service não conhece nem o Hono nem o transporte |
| Testes                               | O service deve ser testável com um cliente de planilha falso, sem rede                                      | Mesmo padrão dos testes existentes em `api/test/`                                                                                                                 |
| Custo                                | **Zero.** Sheets API é gratuita; Cron Triggers existem no plano gratuito do Workers                          | O volume esperado (centenas de inscrições, 96 execuções/dia, ~2 subrequests cada) fica ordens de grandeza abaixo de qualquer limite                                |

---

## 10. Perguntas Esclarecidas / Em Aberto

| #   | Pergunta                                                                     | Resposta                                                                                                                                                                                | Decidido em |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Sincronizar em tempo real (durante o registro) ou periodicamente?            | **Periodicamente, por cron.** Tempo real acoplaria um serviço externo ao caminho da inscrição — exatamente o que a v3.0 da FEAT-0001 removeu — em troca de reduzir a latência de minutos para segundos, num dado que ninguém lê em tempo real | 2026-08-04  |
| 2   | Usar a Sheets API diretamente ou um Apps Script como webhook?                | **Sheets API.** O Apps Script é mais rápido de configurar, mas o código viveria fora do repositório: sem versionamento, sem PR, sem teste — incompatível com o SDD adotado no projeto     | 2026-08-04  |
| 3   | Como saber quais inscrições já foram para a planilha?                        | **Lendo a coluna de ids da própria planilha.** Alternativas (coluna em `candidates`, tabela de controle) exigiriam migration e guardariam estado que pode divergir da planilha real       | 2026-08-04  |
| 4   | Qual o intervalo do cron?                                                    | **1 hora**, como ponto de partida. É configuração pura; se o time achar lento durante o período de inscrições, reduzir não tem custo                                                  | 2026-08-04  |
| 5   | Dados demográficos e de acessibilidade (gênero, cor/etnia, necessidades especiais) devem ir para a planilha? | **Sim, mas o controle de acesso da planilha passa a ser controle de acesso a dado sensível.** Ver seção 13                                             | 2026-08-04  |
| 6   | O que fazer quando a sincronização falha repetidamente?                      | Não definido. Hoje só há o log do Worker, e ninguém é avisado ativamente. Um alerta (email ou Slack) foi considerado e deixado fora da v1.0                                              | Pendente    |
| 7   | A planilha deve refletir exclusões de candidatos no banco?                   | Não definido. Hoje a aplicação nunca exclui candidato, então o caso não existe na prática. Se passar a existir, o job precisa comparar nos dois sentidos, não só acrescentar               | Pendente    |

---

## 11. Dependências Externas

- **Google Sheets API** — gratuita no uso padrão. Limites relevantes: 300 escritas/min por projeto e 60/min por usuário; payload recomendado de até 2 MB. O volume desta feature é irrisório perto disso.
- **Google Cloud** — um projeto e uma service account. Não requer billing habilitado nem cartão de crédito para a Sheets API.
- **Cron Triggers do Cloudflare Workers** — disponíveis no plano gratuito (limite de 5 por conta; esta feature usa 1 por ambiente).

> Diferente da FEAT-0001, esta feature **tem** dependência externa. A diferença que importa é onde ela fica: fora do caminho da inscrição. O Google pode ficar fora do ar por horas sem que nenhum candidato perceba, e sem que nenhuma inscrição se perca — só a planilha fica atrasada.

---

## 12. Métricas de Sucesso

> Sugestões para discutir com o time:
>
> - Nenhuma consulta manual ao D1 para saber quem se inscreveu (é o problema que motivou a feature)
> - Taxa de execuções do cron sem erro
> - Defasagem máxima observada entre a gravação no D1 e o aparecimento na planilha

---

## 13. Notas e Observações

- **A planilha é dado sensível.** Ela reúne, num arquivo compartilhável por link, nome, email, telefone, cor/etnia e informação de necessidades especiais de cada candidato — dados pessoais e um deles sensível na acepção da LGPD. No D1 esse conjunto é protegido por não ter interface alguma; na planilha ele fica a um clique de ser compartilhado a mais gente do que deveria. Consequências práticas: compartilhar **nominalmente**, com quem opera a seleção, nunca por "qualquer pessoa com o link"; não publicar na web; e tratar a lista de acesso como parte da configuração da feature, revisada quando alguém sai do time.
- **O job só acrescenta, nunca corrige.** Se um candidato for editado direto no banco, a planilha continuará mostrando o valor antigo. Isso é aceitável só porque a aplicação não tem nenhum caminho de `UPDATE` em inscrição hoje. É a premissa mais frágil desta spec e a primeira a revisar se surgir edição de inscrição.
- **Falha silenciosa é o modo de falha aceito.** Não avisar ninguém quando a sincronização quebra é uma decisão consciente (pergunta 6), não um esquecimento. O risco concreto é a planilha parar de atualizar sem que o time perceba e concluir que ninguém se inscreveu. Mitigação enquanto não houver alerta: a coluna de data de inscrição torna a defasagem visível a olho nu para quem está olhando a planilha.
- **Recriar a planilha do zero é uma operação segura e barata:** apagar todas as linhas abaixo do cabeçalho e esperar o próximo tick. O job reescreve tudo a partir do D1. Isso vale como plano de recuperação para praticamente qualquer estrago na planilha, e é consequência direta de não guardar estado.
- **Cuidado com a ordem de deploy.** Um deploy do Worker com o cron configurado, mas sem o secret definido no ambiente, faz o job falhar a cada execução do cron. Os secrets devem ser definidos **antes** do primeiro deploy que inclui o trigger — em produção e em staging.
- O passo a passo de configuração (Google Cloud, service account, planilhas, secrets, cron e teste local) está em [docs/setup-google-sheets.md](../docs/setup-google-sheets.md).
