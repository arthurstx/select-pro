# SPEC — Registro de Candidato (Interface / Front-end)

ID: FEAT-0001-UI
Módulo: Registro de candidatos — Camada de UI
Versão: 2.0
Data: 2026-08-03
Status: DRAFT
Depende de: FEAT-0001 (backend) v2.0
Design: Stitch — projeto "Design System Integration" (ID `15618719394726153851`)

> **Changelog v2.0:** o design foi revisado no Stitch e a tela única de "Inscrição Pública" virou um **wizard de 6 etapas**, incluindo um questionário novo (como o candidato conheceu o processo, confirmação de leitura sobre o Movimento Empresa Júnior, experiências/motivação, disponibilidade e diversidade). O conteúdo visual das telas já foi obtido (ver seção 3) — a nota de acesso da v1.0 está resolvida. Esta versão substitui integralmente as seções 3–8 e 12 da v1.0.

---

## 1. Objetivo

Definir o contrato entre as telas de inscrição pública (projeto Stitch) e a API descrita em FEAT-0001, para que a implementação do front-end saiba exatamente quais dados enviar, o que exibir em cada resposta e como tratar cada erro — sem redefinir decisões visuais já tomadas no Stitch.

Esta spec **não** descreve cores, tipografia, espaçamento ou copy final — isso é responsabilidade do design system e deve ser extraído diretamente do projeto Stitch linkado acima. Ela descreve o _comportamento_ de cada tela: quais dados ela captura, para qual endpoint envia, o que faz com a resposta, e como reage a cada erro possível.

---

## 2. Atores

- **Ator primário:** candidato, acessando via desktop ou mobile.

**Restrição herdada de FEAT-0001:** o candidato não tem login; a única barreira de identidade é a confirmação do OTC. A UI não deve implementar nenhum mecanismo de sessão/token para este fluxo.

---

## 3. Escopo — Telas

A tela única de "Inscrição Pública" virou um **wizard de 6 etapas** (v2.0). Todas as etapas do wizard são a mesma operação de negócio — nenhuma delas chama a API por conta própria; o `POST /candidate/pre-register` só é disparado ao final da etapa 6. Desktop e Mobile não têm diferença funcional, só layout.

| #   | Tela / Etapa                  | Screen ID (Stitch)                | Endpoint acionado                                   |
| --- | ------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| 1   | 1. Dados Pessoais              | `c2013045cd7b40a9bed3d27087977daa` | nenhum (avança para etapa 2)                          |
| 2   | 2. Como conheceu                | `e80029e997544a8f9f14c975c840c7e4` | nenhum (avança para etapa 3)                          |
| 3   | 3. Movimento EJ                | `e6966ee78bf4427a9c6e8b06918f4de8` | nenhum (avança para etapa 4)                          |
| 4   | 4. Sobre você                  | `4babeec70a67459a858b13b189058556` | nenhum (avança para etapa 5)                          |
| 5   | 5. Disponibilidade e Diversidade | `b582b23eba31497bbb5b968fb350ec0e` | nenhum (avança para etapa 6)                          |
| 6   | 6. Finalização                 | `0f3e902b4afb4efa898c7af9f45f9ea6` | `POST /candidate/pre-register`                        |
| 7   | Verificação de Código          | *(reaproveitada da v1.0)*           | `POST /candidate/confirm-otc`                         |
| 8   | Confirmação de Sucesso         | *(reaproveitada da v1.0)*           | nenhum (tela terminal, exibe dados da resposta 4.2)   |

**Screen IDs descartados** (variantes exploradas no Stitch e não seguidas): `d72c8973c52e4ef785e089095fbf9994` e `fcafcbf973014f69b4f1b1efeec75c0d` (variante mobile "chrome iOS" da etapa 5/6) e `203f13aaf6fd4fd89871ef8c2f42542a` (tela única da v1.0, substituída pela etapa 1 do wizard).

Um **indicador de progresso** (stepper com os 6 círculos, numerados e rotulados) aparece no topo de todas as etapas do wizard, mostrando a etapa atual e as concluídas — é decoração/orientação, não captura dado.

---

## 4. Fluxo Principal (telas em sequência)

```gherkin
Como candidato,
Eu preencho os dados das 6 etapas do wizard de inscrição,
Ao final, recebo um código por email,
Informo o código na tela de Verificação de Código,
E vejo a tela de Confirmação de Sucesso quando meu cadastro é criado.
```

Cada etapa do wizard tem um botão **Avançar** (avança para a próxima etapa, guardando os dados no estado do wizard — seção 8) e um botão **Voltar** (volta para a etapa anterior sem perder o que já foi preenchido nela). A etapa 1 não tem botão Voltar (não há etapa anterior). Nenhuma etapa 1–5 faz uma chamada de API — a validação de "Avançar" é só client-side (seção 6).

### 4.1 Etapa 1 — Dados Pessoais

- Mesmo formulário da v1.0: `name`, `email`, `phone`, `course`, `semester`, `gender`.
- "Avançar" valida os campos e move para a etapa 2 — **não** chama `pre-register` ainda.

### 4.2 Etapa 2 — Como conheceu

- Captura `referralSource`: um entre `instagram`, `linkedin`, `campus`, `indicacao`, `outros` (seleção única).

### 4.3 Etapa 3 — Movimento EJ

- Exibe um vídeo explicativo (URL configurada via env, fora do escopo desta spec) e um texto fixo sobre o Movimento Empresa Júnior.
- Captura `mejAcknowledged`: checkbox "Confirmo que assisti ao vídeo e compreendi o propósito do MEJ" — **obrigatório marcar** para habilitar "Avançar" (o backend também rejeita `false`, FEAT-0001 v2.0 seção 8.2).

### 4.4 Etapa 4 — Sobre você

- Captura `experience` ("Fale um pouco sobre suas experiências, hard e soft skills", textarea, máx. 1000 caracteres) e `motivation` ("Por que você acha que deve fazer parte da CIMATEC Jr.", textarea, máx. 500 caracteres).
- Exibe contador de caracteres (`0 / 1000`, `0 / 500`) em tempo real — refletindo os limites do schema compartilhado.

### 4.5 Etapa 5 — Disponibilidade e Diversidade

- Captura `saturdayRestriction` ("Possui restrição em realizar o processo seletivo no sábado?", Sim/Não), `specialNeeds` ("Possui alguma necessidade especial?", Sim/Não) e `ethnicity` (select, enum IBGE + "prefiro não informar" — ver FEAT-0001 v2.0 seção 8.1).

### 4.6 Etapa 6 — Finalização

- Tela final do wizard: exibe aviso de que o candidato deve trazer 1kg de alimento não perecível no dia da seleção, e um link para o grupo do WhatsApp (URL configurada via env, sem `target="_blank"` obrigatório mas recomendado; não é uma chamada de API).
- Botão **"Enviar Inscrição"** dispara `POST /candidate/pre-register` (FEAT-0001 v2.0 seção 8.2) com o payload acumulado das 6 etapas.
- Ao submeter com sucesso (`201`), a UI deve:
  - guardar `pendingId` e `expiresAt` (resposta 8.3 do backend) em estado de cliente, **em memória apenas** (não em `sessionStorage`/`localStorage`, não em URL — ver seção 8, distinção importante em relação às respostas do wizard);
  - navegar para a tela de Verificação de Código.
- Em caso de erro (`400`/`409`/`500`), ver seção 7 — como a submissão só acontece aqui, um erro de `email`/`phone` (E1/E2/E3/E4) precisa levar o candidato de volta à etapa 1 para corrigir, mesmo estando na etapa 6.

### 4.7 Tela — Verificação de Código

- Campo único visível ao candidato: `code` (o código recebido por email).
- `pendingId` é enviado junto na requisição, mas **não digitado pelo candidato** — deve vir do estado guardado no passo 4.6 (a spec de backend já deixa isso explícito: "não é necessário reenviar o email").
- Ao submeter com sucesso (`200`), a UI deve:
  - guardar os dados retornados (`id`, `name`, `email`) para exibir na tela de sucesso;
  - limpar o estado do wizard (memória + `sessionStorage`, seção 8) — a inscrição está completa, não há razão para reter as respostas;
  - navegar para a tela de Confirmação de Sucesso.

### 4.8 Tela — Confirmação de Sucesso

- Tela terminal, sem submissão de dados.
- Exibe ao menos `name` e `email` retornados por `confirm-otc` (200 OK, FEAT-0001 seção 8.3), confirmando ao candidato qual cadastro foi criado.
- Não deve conter nenhum link/ação que implique uma feature fora de escopo (login, área do candidato) — nenhuma dessas existe no backend atual (FEAT-0001, seção 1).

---

## 5. Estados de UI por tela

| Tela                     | Estados obrigatórios                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Etapas 1–5 do wizard     | idle → validando (client-side) → avança (grava no estado do wizard, seção 8, e navega para a próxima etapa) — nenhuma chamada de rede |
| Etapa 6 (Finalização)    | idle → enviando (loading, botão "Enviar Inscrição" desabilitado) → sucesso (navega) → erro (ver seção 7)                     |
| Verificação de Código    | idle → enviando → sucesso (navega) → erro (ver seção 7) → **expirado** (ver 7, E5/E9 — exige voltar à etapa 1 e reiniciar)   |
| Confirmação de Sucesso   | apenas exibição — sem estado de carregamento (dados já vieram da tela anterior)                                              |

> **Requisito implícito:** como não há endpoint de reenvio de OTC (FEAT-0001, seção 7, fora de escopo), a tela de Verificação de Código **não pode** ter um botão de "reenviar código" funcional apontando para uma API inexistente. As telas do Stitch para esta etapa não trazem esse elemento — nada a remover.

---

## 6. Validação client-side (antes do POST)

Complementares, não substituem a validação do backend (FEAT-0001, seção 5, E3/E4) — servem para dar feedback imediato e evitar round-trips desnecessários. Cada linha é validada no "Avançar" da etapa correspondente (seção 4), exceto `code`, validado no envio da tela de Verificação:

| Campo                 | Etapa | Validação client-side                                                                                                                                            |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                 | 1     | não vazio                                                                                                                                                        |
| `email`                | 1     | formato de email; a spec de backend usa "institucional" apenas descritivamente (seção 8.1), sem regra formal de domínio — **não bloquear** por domínio no client |
| `phone`                | 1     | formato de telefone (mesmo padrão aceito pelo backend — E4)                                                                                                      |
| `course`               | 1     | obrigatório, um dos valores do enum `Course` (FEAT-0001, seção 8.1)                                                                                              |
| `semester`             | 1     | obrigatório, inteiro entre 1 e 10                                                                                                                                |
| `gender`               | 1     | obrigatório, um dos valores do enum `Gender`                                                                                                                     |
| `referralSource`       | 2     | obrigatório, um dos valores do enum `ReferralSource` (FEAT-0001 v2.0, seção 8.1)                                                                                 |
| `mejAcknowledged`      | 3     | deve ser exatamente `true` — "Avançar" fica desabilitado até o checkbox ser marcado                                                                             |
| `experience`           | 4     | não vazio, máximo 1000 caracteres                                                                                                                                |
| `motivation`           | 4     | não vazio, máximo 500 caracteres                                                                                                                                 |
| `saturdayRestriction`  | 5     | obrigatório, booleano (Sim/Não)                                                                                                                                  |
| `specialNeeds`         | 5     | obrigatório, booleano (Sim/Não)                                                                                                                                  |
| `ethnicity`            | 5     | obrigatório, um dos valores do enum `Ethnicity` (FEAT-0001 v2.0, seção 8.1) — inclui "prefiro não informar", então sempre há uma opção válida                    |
| `code`                 | —     | formato do OTC: 6 dígitos numéricos (FEAT-0001, seção 9, decisão do prompt de implementação)                                                                     |

---

## 7. Tratamento de erros — Tela → Cenário do backend → Comportamento

Mapeamento direto dos cenários E1–E10 (FEAT-0001, seção 5) para onde e como aparecem na UI. Como o `pre-register` só é disparado na etapa 6 (v2.0), qualquer erro de dados capturados em etapas anteriores (E1–E4) só é detectado ali:

| Cenário (backend)                                     | HTTP | Tela onde ocorre      | Comportamento esperado na UI                                                                                                                                                                                    |
| ----------------------------------------------------- | ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 — Email já cadastrado                              | 409  | Etapa 6 (Finalização) | mensagem indicando o campo (`email`) e um link/botão que volta para a etapa 1 **sem perder os dados das demais etapas** (já estão no estado do wizard, seção 8) para o candidato corrigir e refazer o percurso |
| E2 — Telefone já cadastrado                           | 409  | Etapa 6 (Finalização) | idem, campo `phone`                                                                                                                                                                                              |
| E3 — Email inválido                                   | 400  | Etapa 6 (Finalização) | idealmente barrado antes pela validação client-side da etapa 1 (seção 6); se chegar do backend, mesmo tratamento de E1                                                                                          |
| E4 — Telefone inválido                                | 400  | Etapa 6 (Finalização) | idem, campo `phone`, mesmo tratamento de E2                                                                                                                                                                      |
| E5 — OTC expirado/não encontrado                      | 410  | Verificação de Código | mensagem de expiração + CTA para voltar à etapa 1 e reiniciar o wizard completo (não há reenvio, seção 5 do backend)                                                                                             |
| E6 — OTC inválido                                     | 400  | Verificação de Código | erro inline no campo `code`, permite nova tentativa                                                                                                                                                              |
| E7 — OTC de tipo incorreto                            | 400  | Verificação de Código | não deveria ocorrer no fluxo normal (é proteção interna, FEAT-0001 seção 8.1); exibir mensagem genérica, sem expor detalhe técnico                                                                              |
| E9 — Excesso de tentativas                            | 429  | Verificação de Código | mesmo tratamento de E5 — bloqueia e exige novo pré-registro, já que a entrada é invalidada no backend                                                                                                            |
| E10 — Email/telefone em uso, detectado na confirmação | 409  | Verificação de Código | mesmo tratamento de E1/E2 na etapa 6: mensagem indicando o campo + CTA para voltar à etapa 1. O backend mantém o KV, mas como não há campo de correção na tela de verificação, o caminho é reiniciar o preenchimento (o `pendingId` antigo é descartado) |

**Erro de rede / timeout / 5xx genérico:** não coberto pela FEAT-0001 (é infraestrutura, não regra de negócio) — tratar com mensagem genérica de "tente novamente" em qualquer uma das duas telas de submissão (etapa 6 e Verificação), sem invalidar o estado local (`pendingId` e respostas do wizard continuam válidos).

---

## 8. Gerenciamento de estado entre telas

**v2.0 introduz uma distinção deliberada entre dois tipos de estado**, com políticas de persistência diferentes:

### 8.1 Respostas do wizard (etapas 1–5)

- As respostas acumuladas nas 6 etapas (`name` até `ethnicity`, ver seção 6) vivem em estado de aplicação (contexto) **e são espelhadas em `sessionStorage`** a cada "Avançar".
- **Motivação da mudança em relação à v1.0:** um formulário de 6 etapas representa um investimento de preenchimento bem maior que o de tela única; perder tudo num F5 acidental é um custo alto demais para o candidato. `sessionStorage` (não `localStorage`) foi escolhido porque expira ao fechar a aba — não fica persistido indefinidamente em disco.
- Nenhum desses campos é dado de autenticação/posse (ao contrário do `pendingId`) — são só as respostas que o próprio candidato acabou de digitar, então o risco de expor em `sessionStorage` é baixo.
- Ao concluir o fluxo (sucesso em `confirm-otc`, seção 4.7) ou ao reiniciar deliberadamente (CTA de erro E1/E2/E3/E4/E10, seção 7), o `sessionStorage` deve ser limpo.

### 8.2 `pendingId` e `expiresAt`

- Obtidos na resposta da etapa 6 (`pre-register`), necessários na tela de Verificação. Continuam a regra da v1.0: **estado de aplicação em memória apenas** (`useState`/contexto) — **nunca** `localStorage`/`sessionStorage` (é o token de posse temporário citado em FEAT-0001 seção 13, sensível o suficiente para não persistir em disco sem necessidade) e **nunca** em query string (evita vazamento em logs de acesso/histórico do navegador).
- Se o candidato atualizar a página (F5) na tela de Verificação, o `pendingId` se perde — **comportamento aceito por padrão**, já que a spec de backend não define nenhum mecanismo de recuperação fora do fluxo (não há endpoint de "buscar pendência por email"). Nesse caso a UI redireciona para a etapa 1; as respostas do wizard em `sessionStorage` (seção 8.1) sobrevivem ao F5, mas o candidato precisa refazer a submissão (etapa 6) para gerar um novo `pendingId`.
- `expiresAt`: pode ser usado para exibir um contador regressivo/timer na tela de Verificação (comum em telas de OTC), mas isso é **decisão visual do Stitch**, não requisito desta spec — só documentamos que o dado está disponível na resposta.

---

## 9. Fora de Escopo

- Qualquer decisão visual (cor, tipografia, espaçamento, copy exata) — vive no projeto Stitch.
- Reenvio de OTC (herdado de FEAT-0001, seção 7).
- Autenticação/login do candidato (herdado de FEAT-0001, seção 1).
- Telas de erro genéricas do produto (404, manutenção, etc.) — fora do fluxo de registro.
- Internacionalização/idiomas — assume-se pt-BR único, como o restante da spec.

---

## 10. Dados e Contratos

Esta spec não redefine tipos — reaproveita integralmente os contratos de FEAT-0001 v2.0, seção 8:

- Request `pre-register` (payload completo do wizard): FEAT-0001 v2.0 seção 8.2
- Response `pre-register`: FEAT-0001 seção 8.3
- Request `confirm-otc`: FEAT-0001 seção 8.2
- Response `confirm-otc`: FEAT-0001 seção 8.3
- Enums `Course`, `Semester`, `Gender`, `Ethnicity`, `ReferralSource`: FEAT-0001 v2.0 seção 8.1

Qualquer campo que apareça nas telas do Stitch e não esteja nesta lista é uma divergência a ser resolvida antes da implementação.

---

## 11. Critérios de Aceite

- [ ] As 6 etapas do wizard, juntas, capturam exatamente os campos de `pre-register` (FEAT-0001 v2.0 seção 8.2), nem mais nem menos
- [ ] Nenhuma etapa 1–5 chama a API — só a etapa 6 dispara `pre-register`
- [ ] As respostas das etapas 1–5 sobrevivem a um F5 em qualquer etapa do wizard (via `sessionStorage`, seção 8.1)
- [ ] `pendingId` e `expiresAt` são persistidos **apenas em memória** entre a etapa 6 e a tela de Verificação (nunca em `sessionStorage`/`localStorage`/URL, seção 8.2)
- [ ] Tela de Verificação envia `pendingId` + `code` sem exigir reentrada de email
- [ ] Todos os cenários E1–E10 têm tratamento definido em alguma tela (seção 7)
- [ ] Nenhum botão de "reenviar código" funcional existe na tela de Verificação
- [ ] Tela de Confirmação de Sucesso exibe apenas dados vindos da resposta de `confirm-otc`, sem nova chamada de API
- [ ] Validações client-side (seção 6) não substituem, apenas antecipam, as validações de backend
- [ ] Etapa 3 (Movimento EJ) não permite "Avançar" sem o checkbox `mejAcknowledged` marcado
- [ ] Etapa 4 (Sobre você) exibe os contadores de caracteres (0/1000, 0/500) refletindo os limites reais do schema

---

## 12. Notas

- Esta spec assume que o export de código do projeto Stitch será adaptado ao stack do projeto (não copiado literalmente) — a integração com os endpoints descrita aqui (seções 4, 7, 8) é o que deve ser implementado por cima do visual já pronto.
- Qualquer elemento visual encontrado nas telas do Stitch que sugira uma funcionalidade não coberta por FEAT-0001 (ex: reenvio de código, login, edição pós-confirmação) deve ser tratado como gap a esclarecer antes de codar — não como liberdade de implementação.
- URLs do vídeo institucional (etapa 3) e do grupo de WhatsApp (etapa 6) são configuração de ambiente, não parte do contrato de dados — ver `front/.env.example`.
