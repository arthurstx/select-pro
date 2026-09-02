# SPEC — Validação de Presença do Candidato (Interface / Front-end)

ID: FEAT-0005-UI
Módulo: Operação do processo seletivo — check-in / Camada de UI
Versão: 1.2
Data: 2026-08-11
Status: DRAFT
Depende de: FEAT-0005 (backend) v1.2
Design: Stitch — projeto "Design System Integration" (ID `15618719394726153851`)

> **Changelog v1.2 — "sem processo corrente" mudou de significado.** O backend passou a criar a edição sob demanda (FEAT-0005 v1.2, seção 4.1.1), então esse estado deixou de ser "alguém esqueceu de cadastrar" e virou **sinal de defeito**: em operação normal ele não acontece. Continua sendo estado terminal, mas a copy muda — não há nada que quem administra o processo seletivo possa cadastrar para resolver. Ver seções 7 e 12.
>
> Nada mais na camada de UI muda — o log de check-in introduzido no backend é escrita pura, sem tela nesta spec.
>
> **Changelog v1.1 — os mockups dos estados foram gerados.** A v1.0 listava na seção 12 que faltava tudo que não fosse o estado neutro — a mesma lacuna que a FEAT-0003-UI registrou e que virou dívida. Desta vez os estados foram desenhados antes da implementação: carregando, busca sem resultado, filtro vazio, erro de carregamento, botão em envio e confirmação com desfazer, todos com ID na seção 3.
>
> **Também na v1.1:** a variante mobile da tela principal foi localizada, e a seção 5 passou a marcar explicitamente quais estados têm mockup e quais precisam ser derivados. Dois ainda não existem — ver seção 12.
>
> **Contexto:** esta é a primeira tela da **área logada** de verdade. O `front/app/painel/` existe hoje como placeholder — um card com os dados da própria sessão — e não tem shell de navegação nenhum. A tela de check-in é a primeira que precisa de sidebar, e a primeira do projeto que lê uma lista paginada do servidor.
>
> É também a primeira tela do projeto em que **o toque precede a confirmação do servidor**. Toda a UI anterior era formulário: preenche, envia, espera, navega. Aqui o avaliador toca um nome, e a lista tem que responder no mesmo instante, com uma fila de candidatos esperando na frente dele. A seção 8 é sobre isso.

---

## 1. Objetivo

Definir o contrato entre a tela de check-in (projeto Stitch) e as três rotas descritas em FEAT-0005: o que a tela lê, o que envia, como reage a cada erro, e como mantém a lista coerente enquanto o avaliador marca presença mais rápido do que a rede responde.

Esta spec **não** descreve cores, tipografia ou espaçamento: isso sai do design system já estabelecido em `front/app/globals.css`. As exceções são a copy dos estados de erro e vazio (seções 5 e 7), que não existe no Stitch e carrega regra de negócio, e os pontos em que o design conflita com o contrato (seção 12).

---

## 2. Atores

- **Ator primário:** membro autenticado (papel `avaliador` ou `admin`), em pé, no celular, na porta do evento — e sentado, no desktop, acompanhando o credenciamento

**Restrição:** o candidato nunca vê esta tela. Ele não tem login (FEAT-0001, seção 2) e não faz o próprio check-in.

---

## 3. Escopo — Telas

| # | Tela                   | Rota               | Stitch (desktop)                   | Stitch (mobile)                    |
| - | ---------------------- | ------------------ | ---------------------------------- | ---------------------------------- |
| 1 | Check-in de Candidatos | `/painel/check-in` | `441dcdf498624dd98d46c727b6e78c4e` | `348fd6afda704aceb8c228f2d7077aa6` |

Há uma única rota. Os demais mockups são **estados** dela, não telas próprias — nenhum tem URL, e nenhum deve virar rota:

| Estado                   | Stitch (mobile)                    |
| ------------------------ | ---------------------------------- |
| Carregando candidatos    | `b6e8d467107f459f8f71bc520244337d` |
| Busca sem resultado      | `ccf25b34654a47fea68b700d8c03d8c0` |
| Filtro "Presentes" vazio | `6126c3ffc54d4681b8f19b48aeb091ea` |
| Erro de carregamento     | `0eee6bb7d2ea4cb5ad0549d461183fea` |
| Botão em envio           | `7367ee0b486046aea3c1f640e913b83b` |
| Confirmação com desfazer | `d8dc8c3afdf44bbb88f5a9cf4e573d96` |

> **Os seis estados só existem em mobile.** No desktop eles precisam ser derivados do design system, mantendo a mesma copy e a mesma hierarquia — o que muda é o layout, não a mensagem. Duas telas de estado ainda não existem em nenhum device; ver seção 12.

A tela é um **Client Component**. Ela depende de estado de sessão, de mutação otimista e de estado de busca/filtro/página que vive na URL ou na memória — nada disso um Server Component consegue sustentar. Isso contraria o padrão do `front/AGENTS.md` (preferir Server Components) pelo mesmo motivo estrutural que as telas de auth da FEAT-0003-UI.

A rota fica sob `front/app/painel/`, que já aplica o `AuthGuard` (`front/components/auth/auth-guard.tsx`) no layout. Nenhuma proteção nova é necessária — e, como na FEAT-0003-UI seção 8.4, ela continua sendo **UX, não segurança**: a barreira real é a API respondendo `401`.

---

## 4. Fluxo Principal (telas em sequência)

### 4.1 Abertura da tela — `/painel/check-in`

1. `AuthGuard` resolve a sessão. Sem sessão, redireciona para `/login`.
2. A tela dispara `GET /candidates` com os parâmetros default (`page=1`, `per_page=25`, `status=todos`).
3. Enquanto a resposta não chega, exibe o estado **carregando** (seção 5).
4. Com a resposta, exibe a lista e o rótulo do processo corrente (`data.process.label`).

### 4.2 Marcar presença

1. Avaliador toca **"Marcar presença"** na linha do candidato.
2. A UI **atualiza a linha imediatamente**, antes de qualquer resposta (seção 8.1): badge vira "PRESENTE", botão vira "Desmarcar".
3. `PUT /candidates/{id}/checkin`.
4. Sucesso (`200`): a UI reconcilia com o `checkedInAt` que veio do servidor.
5. Falha: a linha **volta ao estado anterior** e a UI exibe o erro (seção 7).

### 4.3 Desmarcar presença

Mesmo fluxo de 4.2, invertido: a linha volta a "AGUARDANDO" imediatamente, `DELETE /candidates/{id}/checkin`, `204` confirma, falha reverte.

### 4.4 Busca e filtro

1. Avaliador digita no campo de busca ou seleciona um chip de status.
2. A UI aguarda ~300 ms sem digitação (debounce) antes de disparar.
3. **`page` volta para 1.**
4. `GET /candidates` com os novos parâmetros.

> **O reset de `page` não é detalhe.** É o bug clássico desta tela: o avaliador está na página 3, digita um nome, e a requisição sai com `page=3` sobre um conjunto filtrado que tem uma página só. A resposta volta vazia, e a tela diz "nenhum candidato encontrado" para um candidato que está lá. O sintoma culpa a busca; a causa é a página.

### 4.5 Paginação

Trocar de página dispara `GET /candidates` preservando `search` e `status`. A lista **não volta ao estado de carregamento** entre páginas (seção 8.3).

---

## 5. Estados de UI

| Estado                    | Quando                                          | O que aparece                                                                                            | Mockup     |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| Carregando (primeira vez) | requisição inicial pendente                     | skeleton de ~5 linhas no lugar da lista; busca e filtros visíveis, desabilitados                          | sim        |
| Lista com dados           | resposta com `items.length > 0`                 | as linhas, a paginação e o rótulo do processo                                                             | sim        |
| Busca sem resultado       | `items` vazio **e** `search` preenchido         | ícone de lupa, "Nenhum candidato encontrado", e o termo buscado citado na mensagem                        | sim        |
| Filtro sem resultado      | `items` vazio, `search` vazio, `status ≠ todos` | copy própria por filtro — "Nenhuma presença confirmada ainda" / "Todos os candidatos já fizeram check-in" | sim        |
| Nenhum candidato inscrito | `items` vazio, sem busca nem filtro             | "Nenhum candidato inscrito neste processo seletivo"                                                       | **falta**  |
| Sem processo corrente     | `409 NO_ACTIVE_SELECTION_PROCESS` (seção 7)     | estado terminal, no lugar da lista, das buscas e dos filtros                                              | **falta**  |
| Erro de carregamento      | falha de rede ou 5xx no `GET`                   | banner de erro + botão "Tentar novamente"; a lista anterior, se houver, permanece visível                 | sim        |
| Linha em envio            | `PUT`/`DELETE` pendente naquela linha           | só o botão daquela linha entra em carregamento; **as demais linhas seguem clicáveis**                     | sim        |
| Confirmação com desfazer  | `PUT` bem-sucedido                              | snackbar "Presença de {nome} confirmada." com ação "Desfazer"                                             | sim        |

> **As quatro variações de lista vazia não são preciosismo.** "Nenhum candidato encontrado" é uma resposta correta para a busca e uma resposta *errada* para o filtro "Presentes" no começo do dia, quando ninguém chegou ainda — ali a lista vazia é o estado esperado, não uma falha. Colapsar as quatro numa mensagem só faz o avaliador procurar problema onde não há.
>
> **Sete dos nove estados têm mockup (seção 3), e isso é a correção de um erro conhecido.** A FEAT-0003-UI, seção 12, registrou que os mockups de auth vieram só no estado neutro e que era ali que morava a maior parte da regra da feature. Desta vez os estados foram desenhados antes de a implementação começar.
>
> Os dois que faltam são os dois em que a lista vazia **não** é culpa de um filtro: "nenhum candidato inscrito" e "sem processo corrente". Ver seção 12.

---

## 6. Validação client-side (antes da chamada)

Não há formulário nesta tela. As únicas regras client-side são de parâmetro:

| Param      | Validação                                                                    |
| ---------- | ---------------------------------------------------------------------------- |
| `page`     | inteiro ≥ 1; nunca enviado maior que `pagination.totalPages` da última resposta |
| `per_page` | fixo em 25 nesta versão — a UI não expõe seletor                              |
| `search`   | `trim()`; string vazia é omitida do query string, não enviada como `search=`  |
| `status`   | um dos três valores do chip selecionado                                       |

Todos vêm de `PaginationQuerySchema`/`ListCandidatesQuerySchema` em `shared` — nenhuma regra reescrita no front (`front/AGENTS.md`, seção 1).

---

## 7. Tratamento de erros — Cenário do backend → Comportamento

| `code` / situação                 | HTTP | Comportamento e intenção da copy                                                                                                                                                            |
| --------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_ACTIVE_SELECTION_PROCESS`     | 409  | **Estado terminal da tela**, não banner. Desde a v1.2 do backend a edição é criada sob demanda, então este erro significa que **algo quebrou**, não que faltou cadastro. A copy não deve pedir nenhuma ação ao avaliador (não há nada que ele ou quem administra o PS possa cadastrar) — deve dizer que o sistema está indisponível e a quem avisar |
| `CANDIDATE_NOT_IN_ACTIVE_PROCESS` | 409  | Reverte a linha e explica: o candidato é de outra edição. Copy separada de `CANDIDATE_NOT_FOUND` — são situações diferentes                                                                    |
| `CANDIDATE_NOT_FOUND`             | 404  | Reverte a linha e recarrega a lista: a tela está olhando um dado que não existe mais                                                                                                          |
| `INSUFFICIENT_ROLE`               | 403  | Não deve acontecer com os papéis atuais. Mensagem genérica de permissão, sem sugerir tentar de novo                                                                                           |
| `TOKEN_EXPIRED`                   | 401  | **Invisível.** O wrapper de fetch da FEAT-0003-UI (seção 8.3) renova e repete                                                                                                                 |
| `INVALID_TOKEN`                   | 401  | Sessão encerrada: limpa o estado e navega para `/login`                                                                                                                                      |
| `MAINTENANCE_MODE`                | 503  | Exibe a mensagem do backend como está                                                                                                                                                        |
| Erro de rede / 5xx                | —    | Reverte a linha, mensagem de "tente novamente". **Nunca deslogar por erro de rede**                                                                                                          |

> **Toda falha de marcação reverte a linha, e a reversão precisa ser visível.** Um erro que aparece num canto da tela enquanto o badge continua verde é pior que nenhum erro: o avaliador segue confiando numa presença que não foi gravada, e só descobre na hora de conferir a sala.
>
> A rede na porta de um evento é o pior caso realista — sinal ruim, muita gente, celular alternando entre Wi-Fi e dados. Esta tabela é escrita assumindo que a falha acontece, não que é exceção.

---

## 8. Estado da lista no navegador

Esta seção é o núcleo da spec.

### 8.1 Atualização otimista, com rollback

A marcação de presença **não** espera a resposta do servidor para pintar a linha. Com `@tanstack/react-query` (já dependência do front), a mutação usa `onMutate` para escrever o estado novo no cache, guarda o anterior, e `onError` para restaurá-lo.

> **Por que isso não é enfeite:** o avaliador está de pé, com uma fila na frente, tocando um nome a cada poucos segundos. Uma tela que trava por 300–800 ms a cada toque faz ele tocar de novo achando que não pegou — e a segunda chamada é exatamente o cenário que o `PUT` idempotente do backend (FEAT-0005, E4) existe para absorver. As duas decisões são a mesma decisão, vista dos dois lados.

### 8.2 A invalidação não pode redesenhar a lista inteira

Depois do sucesso, a reconciliação atualiza **apenas a linha afetada** no cache. Um `invalidateQueries` que refaz o `GET /candidates` a cada marcação traz de volta o problema que a atualização otimista resolveu: a lista pisca, e um candidato marcado enquanto o filtro é "Ausentes" desaparece debaixo do dedo, no meio da fila.

> Se o filtro ativo for `presentes` ou `ausentes`, a linha marcada **deixa de pertencer** ao conjunto filtrado. A tela **não** a remove imediatamente — ela permanece até a próxima leitura do servidor. Remover na hora faz as linhas seguintes subirem no instante do toque, e o próximo toque acerta a pessoa errada.

### 8.3 Troca de página não pode piscar

`placeholderData` (o antigo `keepPreviousData`) mantém a página anterior renderizada enquanto a próxima carrega. Sem isso, cada troca de página passa pelo skeleton e o layout salta.

### 8.4 Busca, filtro e página vivem juntos

Os três compõem a chave de cache do `useQuery`. Mudança em `search` ou `status` reseta `page` para 1 (seção 4.4) **antes** de a chave mudar, não depois — resetar depois dispara duas requisições, e a primeira é a errada.

---

## 9. Fora de Escopo

- Contador "X de Y presentes" no cabeçalho — o `total` da resposta já permite construí-lo, mas ele não está no mockup
- Seletor de itens por página (`per_page` é fixo em 25)
- Ações em lote (marcar vários candidatos de uma vez)
- Exportação da lista
- Busca por email ou telefone — só por nome (FEAT-0005, seção 8.2)
- Tela de logs administrativos
- **Dark mode.** Os tokens `.dark` existem em `front/app/globals.css` desde a FEAT-0001-UI, mas nenhum mockup tem variante escura — mesma decisão da FEAT-0003-UI
- Shell de navegação reutilizável para toda a área logada: esta spec desenha a sidebar da tela, não um sistema de navegação (ver seção 12)

---

## 10. Dados e Contratos

Tudo de `shared`, nada redeclarado no front (`front/AGENTS.md`, seção 1):

| Uso                          | Origem                                                        |
| ---------------------------- | ------------------------------------------------------------- |
| Parâmetros da listagem       | `ListCandidatesQuerySchema` (`checkin.schema.ts`)             |
| Item da lista                | `CandidateCheckinItemSchema`                                  |
| Resposta da listagem         | `ListCandidatesResponseSchema`                                |
| Metadados de paginação       | `PaginationMetaSchema` (`pagination.schema.ts`)               |
| Resposta da marcação         | `CheckinResponseSchema`                                       |
| Rótulos de curso             | `COURSE_LABELS` (`shared`) — **não** reescrever no componente |
| Códigos de erro              | `CheckinErrorCode` e `AuthErrorCode` — usar o enum, nunca string literal |
| Envelope de erro             | `ErrorResponseSchema` (`error.schema.ts`)                     |

---

## 11. Critérios de Aceite

- [ ] O toque em "Marcar presença" atualiza a linha antes da resposta do servidor
- [ ] Falha na marcação reverte a linha ao estado anterior **e** exibe erro visível
- [ ] Uma linha em envio não bloqueia as demais
- [ ] Mudar `search` ou `status` reseta `page` para 1, e dispara **uma** requisição
- [ ] Trocar de página não exibe skeleton nem faz o layout saltar
- [ ] Marcar presença com filtro "Ausentes" ativo não remove a linha debaixo do dedo
- [ ] Os quatro estados de lista vazia têm copy distinta
- [ ] `NO_ACTIVE_SELECTION_PROCESS` produz estado terminal, não banner sobre uma lista vazia
- [ ] Erro de rede não desloga o avaliador
- [ ] A tela não exibe gênero nem etnia de nenhum candidato
- [ ] Alvo de toque de no mínimo 44px no mobile
- [ ] Botões só-ícone têm rótulo acessível
- [ ] Nenhum tipo de request/response desta feature é declarado fora de `shared`
- [ ] `COURSE_LABELS` de `shared` é a fonte dos rótulos de curso

---

## 12. Notas — divergências entre o design e o contrato

- **Faltam dois estados, e são os dois em que a lista vazia não é culpa de um filtro:** "nenhum candidato inscrito neste processo" e "sem processo corrente". Os dois dizem ao avaliador que o problema não está na busca dele — o primeiro que ninguém se inscreveu ainda, o segundo que o sistema não sabe de que dia está falando. Reaproveitar a copy de "busca sem resultado" em qualquer um deles manda o avaliador procurar erro de digitação onde não há. **"Sem processo corrente" é o mais raro dos dois e o mais delicado de escrever:** desde a v1.2 do backend a edição é criada sozinha, então esse estado só aparece se algo estiver quebrado — é uma tela de falha de sistema que o avaliador vai encontrar no pior momento possível, de pé, com fila na frente. Ela precisa dizer a quem avisar, e não sugerir nenhuma ação que ele não possa executar dali.
- **Os seis estados existentes só têm variante mobile** (seção 3). No desktop precisam ser derivados do design system — mesma copy, mesma hierarquia, layout diferente.
- **O telefone vem do banco sem formato padronizado.** A FEAT-0005, seção 7, registra que a normalização foi agrupada com a mudança de `UNIQUE` numa spec seguinte. Até lá, o mockup mostra telefones formatados que o dado real não garante: a tela precisa tolerar formatos variados sem quebrar o alinhamento da linha, e **não** deve tentar reformatar no cliente — mascarar no front esconderia justamente a inconsistência que a próxima spec vai corrigir.
- **Não existe shell de navegação no app.** `front/app/painel/` tem `AuthGuard` e um card, e nenhuma sidebar, header ou nav. A sidebar preta de 280px do mockup seria a primeira do projeto — e como os mockups do Stitch já incluem "Dashboard Avaliador", "Gestão de Usuários" e outras telas com a mesma sidebar, ela deveria nascer como layout compartilhado em `front/app/painel/layout.tsx`, não como markup desta página.
- **Os primitivos de UI não existem.** `front/components/ui/` tem `alert`, `button`, `checkbox`, `field`, `input`, `label`, `radio-group`, `select`, `spinner`, `textarea` — e **não** tem `badge`, `card`, `tabs`, `skeleton` nem paginação. Todos entram via `shadcn` (style `new-york`, base `neutral`, conforme `front/components.json`).
- **O verde de "PRESENTE" já existe e nunca foi usado.** `--success: #1e7a3d` (e `#4ade80` no `.dark`) está em `front/app/globals.css` desde a FEAT-0001-UI, sem nenhum consumidor. É o token do badge — não introduzir um verde novo.
- **O HTML do Stitch é referência visual, não código para colar.** Vale integralmente a nota da FEAT-0003-UI, seção 12: ele vem em Tailwind v3 via CDN (proibido pelo `front/AGENTS.md`) e com uma paleta Material 3 que é um sistema diferente do que o projeto usa.
- **"Desmarcar" não pode parecer destrutivo.** É correção de toque errado, não exclusão — botão secundário discreto, sem vermelho de `--destructive`, sem diálogo de confirmação. O diálogo custaria um toque a mais em cada correção, num contexto em que o erro é frequente e barato de desfazer.
- **O snackbar de desfazer é a rede de segurança do toque errado**, e é preferível ao diálogo de confirmação pelo mesmo motivo: move o custo do caso comum (marcação certa) para o caso raro (marcação errada).
