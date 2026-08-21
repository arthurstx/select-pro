# SPEC — Dashboard de Inscrições (Interface / Front-end)

ID: FEAT-0007-UI
Módulo: Operação do processo seletivo — visão das inscrições / Camada de UI
Versão: 1.0
Data: 2026-08-19
Status: DRAFT
Depende de: FEAT-0007 (backend) v1.0
Design: Stitch — projeto "Design System Integration" (ID `15618719394726153851`)

> **Contexto:** esta tela substitui o placeholder de `/painel` e é a primeira do produto com **visualização de dados** — gráficos, não só listas e formulários. Também é a primeira em que o que aparece na tela depende do papel de quem olha.
>
> O ponto central da camada de UI aqui: **o front não decide o que esconder.** Ele desenha o que a API mandou. Se `byGender` não veio no payload, o gráfico não existe — não porque o componente checou o papel, mas porque não há dado. Ver seção 8.

---

## 1. Objetivo

Definir o contrato entre a tela de dashboard e as três rotas da FEAT-0007: o que ela lê, como filtra, como reage a cada erro, e como se comporta quando a mesma tela precisa parecer diferente para dois papéis sem duplicar código.

Não descreve cores nem espaçamento — isso sai do design system em `front/app/globals.css`. As exceções são a copy dos estados (seção 5), que carrega regra, e as divergências entre o mockup e o produto (seção 12).

---

## 2. Atores

- **Ator primário:** `admin` — a tela completa.
- **Ator secundário:** `avaliador` — a mesma tela, sem os blocos de demografia.

**Restrição:** o candidato nunca vê esta tela. É a que exibe mais dado de terceiro no produto.

---

## 3. Escopo — Telas

| # | Tela | Rota | Stitch |
| - | ---- | ---- | ------ |
| 1 | Dashboard de Inscrições | `/painel` | `bd9d60d042c346d0a2a82cc740aeeab0` |

Uma rota só. O restante são **estados** dela:

| Estado | Stitch |
| --- | --- |
| Filtro de data — fechado / aberto / aplicado | `6bfb542c…` · `2146dbb5…` · `c8653e11…` |
| Mobile | `2d6718fe75cd42809cfd678673a9f984` |
| Mobile — sem inscrições / carregando | `8c8c3f7c…` · `aa7131ba…` |

> **Os estados desktop de carregamento, vazio, erro e busca sem resultado NÃO têm mockup utilizável.** A leva gerada para eles divergiu e inventou um pipeline de fases inexistente (seção 12). Derive-os das telas mobile de estado e do padrão já implementado em `front/app/painel/check-in/_components/candidate-list.tsx`, que resolve exatamente esses quatro casos.

A tela é um **Client Component** sob `front/app/painel/`, que já aplica o `AuthGuard`. `front/app/painel/session-summary.tsx` deixa de ser usado e sai.

---

## 4. Fluxo Principal

### 4.1 Abertura

1. `AuthGuard` resolve a sessão.
2. A tela dispara **duas** requisições em paralelo: `GET /dashboard/metrics` e `GET /dashboard/candidates`, ambas com o recorte padrão (edição corrente).
3. Enquanto respondem, exibe o estado de carregamento (seção 5).

> **São duas queries independentes de propósito.** Os filtros da tabela (busca, data, página) não afetam as métricas — mudar a busca refaz só a listagem. Uma requisição única faria o gráfico piscar a cada tecla digitada.

### 4.2 Troca de edição

Muda o recorte das **duas** queries. O controle "Soma / Comparar edições" só aparece com "Todas as edições" selecionado, e alterna `mode` na query de métricas.

### 4.3 Filtros da tabela

Busca por nome (debounce de ~300 ms) e intervalo de data de inscrição. Ambos afetam **apenas** a listagem.

**`page` volta para 1 sempre que a busca, o intervalo ou a edição mudam — no mesmo `setState` que altera o filtro, nunca num efeito separado.** Resetar depois dispara duas requisições, e a primeira é a errada. É a mesma armadilha documentada na FEAT-0005-UI, seção 8.4.

### 4.4 Detalhe

Clicar na linha abre o painel lateral e dispara `GET /dashboard/candidates/{id}`. O painel tem seu próprio estado de carregamento — a tabela atrás continua utilizável.

---

## 5. Estados de UI

| Estado | Quando | O que aparece |
| --- | --- | --- |
| Carregando | primeira carga | Skeleton nos cards, nos gráficos e em ~5 linhas da tabela; títulos permanecem legíveis |
| Sem inscrições na edição | `total: 0`, sem filtro ativo | No lugar dos gráficos **e** da tabela, uma mensagem única: "Nenhuma inscrição nesta edição ainda". Cards mostram 0. **Não desenhar gráficos zerados** |
| Busca sem resultado | `items` vazio com `search` preenchido | Cards e gráficos seguem preenchidos; só o corpo da tabela é substituído, citando o termo, com ação de limpar |
| Filtro de data sem resultado | `items` vazio com intervalo ativo | Copy própria — ver abaixo |
| Erro de carregamento | falha em `metrics` ou `candidates` | Mensagem com "Tentar novamente" no lugar da área afetada; a outra query, se funcionou, continua na tela |
| Erro no detalhe | falha em `candidates/{id}` | O erro fica **dentro** do painel; a tabela atrás não é afetada |

> **O "filtro de data sem resultado" merece copy própria porque tem uma causa que a pessoa não vê.** Edição e intervalo são dois recortes temporais sobrepostos: escolher `2026.1` (janeiro a julho) com datas de agosto devolve vazio corretamente (FEAT-0007, E8). A mensagem precisa dizer que o período selecionado está fora da edição — senão o usuário conclui que não há inscritos, e a tela mentiu por omissão.

---

## 6. Validação client-side

Não há formulário. As regras são de parâmetro:

| Param | Regra |
| --- | --- |
| `search` | `trim()`; vazio é omitido da query, não enviado como `search=` |
| `from` / `to` | Datas; se `from > to`, a UI **impede aplicar** e explica, em vez de deixar a API devolver `400` |
| `page` | Inteiro ≥ 1, nunca maior que `totalPages` da última resposta |

Tudo derivado dos schemas em `shared` — nenhuma regra reescrita (`front/AGENTS.md`, seção 1).

---

## 7. Tratamento de erros

| `code` | HTTP | Comportamento |
| --- | --- | --- |
| `NO_ACTIVE_SELECTION_PROCESS` | 409 | Estado terminal. Desde a FEAT-0005 v1.2 a edição é criada sob demanda, então isto significa **defeito**, não falta de cadastro: não peça ação ao usuário, diga a quem avisar |
| `SELECTION_PROCESS_NOT_FOUND` | 404 | Edição inválida no seletor — voltar para a corrente e avisar |
| `CANDIDATE_NOT_FOUND` | 404 | Fecha o painel e recarrega a listagem: a tela está olhando um dado que não existe mais |
| `INSUFFICIENT_ROLE` | 403 | Não deve acontecer com os papéis atuais. Mensagem genérica, sem sugerir tentar de novo |
| `TOKEN_EXPIRED` | 401 | **Invisível** — o `authFetch` renova e repete |
| `INVALID_TOKEN` | 401 | Sessão encerrada: limpa e navega para `/login` |
| `MAINTENANCE_MODE` | 503 | Exibe a mensagem do backend como está |
| Rede / 5xx | — | "Tentar novamente". **Nunca deslogar por erro de rede** |

---

## 8. O papel não é decidido no front

Esta é a seção que define se a feature está certa.

**O front NÃO consulta `user.role` para decidir o que renderizar.** Ele verifica se a chave veio no payload:

- `byGender` ou `byEthnicity` ausentes ⇒ a seção "Demografia" não é renderizada.
- `demographics` ausente no detalhe ⇒ o bloco não é renderizado.

> **Por que isso importa mais do que parece:** se o front escondesse por papel, teríamos a regra em dois lugares — e a API continuaria entregando o dado, bastando abrir o DevTools para ler a etnia de todos os candidatos. Reagir à forma do payload faz a restrição ser real, e mantém o componente burro: ele desenha o que recebe.
>
> Consequência prática: **não existe um "modo avaliador" no código do front.** Existe uma tela, que desenha menos blocos quando recebe menos dado.

### 8.1 Duas queries, não uma

`metrics` e `candidates` são queries separadas com chaves de cache separadas. Filtros da tabela invalidam só a segunda.

### 8.2 Frescor

`staleTime: 0` e `refetchOnWindowFocus: true` nestas queries, sobrescrevendo o default global de 5 minutos de `front/app/providers.tsx`. Aquele default foi exatamente a causa do bug em que o filtro do check-in só atualizava com F5 (FEAT-0005-UI): voltar a um filtro já visitado servia cache velho sem revalidar.

### 8.3 Troca de página não pode piscar

`placeholderData` mantém a página anterior visível durante a busca da próxima — mas **só quando apenas a página mudou**. Mudança de busca, data ou edição precisa de carregamento de verdade, senão a tela mostra o resultado do filtro anterior e parece que o filtro não funcionou.

---

## 9. Fora de Escopo

- Exportação de dados — a sincronização com o Sheets (FEAT-0002) já cobre.
- Filtro por curso ou semestre na tabela (nesta versão só nome e data).
- Presença/check-in, em qualquer forma.
- Qualquer ação sobre o candidato: o painel é **somente leitura**.
- Dark mode — mesma decisão da FEAT-0005-UI.
- Deep link para um candidato (`/painel/candidatos/[id]`). O painel é estado da tela, não rota.

---

## 10. Dados e Contratos

Tudo de `shared`, nada redeclarado (`front/AGENTS.md`, seção 1):

| Uso | Origem |
| --- | --- |
| Query e resposta de métricas | `DashboardMetricsQuerySchema` / `DashboardMetricsResponseSchema` |
| Query e resposta da listagem | `DashboardCandidatesQuerySchema` / `DashboardCandidatesResponseSchema` |
| Detalhe | `CandidateDetailResponseSchema` |
| Paginação | `PaginationMetaSchema` |
| Rótulos dos gráficos | `COURSE_LABELS`, `GENDER_LABELS`, `ETHNICITY_LABELS`, `REFERRAL_SOURCE_LABELS` |
| Telefone formatado | `formatPhone` |
| Erros | `CheckinErrorCode`, `AuthErrorCode`, `ErrorResponseSchema` |

**As chaves das séries vêm como slug e são traduzidas na exibição.** Os mapas de rótulo já existem em `shared/src/schemas/candidate.schema.ts` — nenhum rótulo é reescrito no componente de gráfico.

---

## 11. Critérios de Aceite

- [ ] Com payload sem `byGender`/`byEthnicity`, a seção "Demografia" **não é renderizada** — e o componente não consulta o papel para decidir isso
- [ ] Mudar a busca ou o intervalo de data **não** refaz a query de métricas
- [ ] Mudar busca, data ou edição reseta `page` para 1 e dispara **uma** requisição
- [ ] Trocar de página não exibe skeleton nem faz o layout saltar
- [ ] Trocar de filtro **exibe** carregamento, em vez de manter o resultado anterior
- [ ] Intervalo de data fora da janela da edição mostra a copy específica, não "nenhum candidato encontrado" genérico
- [ ] `from > to` é impedido na UI, sem ida à API
- [ ] Erro no painel de detalhe não derruba a tabela
- [ ] Telefones aparecem formatados via `formatPhone`
- [ ] Os textos do questionário aparecem na íntegra, sem truncar
- [ ] A tela não exibe nenhuma noção de fase, aprovação ou presença
- [ ] Alvo de toque de no mínimo 44px no mobile

---

## 12. Notas — divergências entre o design e o produto

Verifiquei os mockups; o que segue **não** deve ser reproduzido:

- 🔴 **Os estados desktop inventaram um pipeline de fases** — `Em Análise`, `Aguardando revisão técnica`, `Aprovados (1ª Fase)`, `Homologados` — e uma edição chamada `Processo Seletivo Engenharia 2024`. Nada disso existe: não há coluna de fase no schema, e as edições se chamam `2026.1`/`2026.2`. É a terceira vez que a ferramenta sugere fases (antes foi o botão "Avançar Fase"); a sugestão vai voltar.
- 🔴 **O campo de busca por nome desapareceu** das três telas de filtro de data — o HTML não tem nenhum `<input>`. Ele existe na tela final e é requisito. Implementar.
- ⚠️ **O rótulo `PNE`** sobrevive no painel de detalhe. O termo não é usado no produto; o card equivalente já é "Com necessidade especial". Usar o mesmo texto nos dois lugares.
- ⚠️ **Duas telas mobile com o mesmo título** (`2d6718fe` e `114c1fd2`). Usar uma.
- ⚠️ **Não há mockup do estado "Comparar edições"** — só do "Soma". Derivar: mesmas séries, uma barra por edição, com legenda.
- **Componentes que faltam** em `front/components/ui/`: `chart`, `sheet`, `table` e `popover`. Todos via `shadcn` (style `new-york`, base `neutral`).
- **Para o intervalo de datas, usar `<input type="date">` nativo dentro do `popover`**, não `react-day-picker`. Dois campos não justificam a dependência — mesma linha de raciocínio da decisão sobre o peso da `libphonenumber-js` na FEAT-0006, e aqui o ganho seria ainda menor.
- **Cores das séries:** uma série, uma cor. O mockup do gráfico de curso usa três tons sem critério, com um curso de valor maior aparecendo mais claro que um de valor menor — sugere um ranking que não existe.
