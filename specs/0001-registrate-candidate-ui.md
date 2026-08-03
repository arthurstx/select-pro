# SPEC — Registro de Candidato (Interface / Front-end)

ID: FEAT-0001-UI
Módulo: Registro de candidatos — Camada de UI
Versão: 3.0
Data: 2026-08-03
Status: DRAFT
Depende de: FEAT-0001 (backend) v3.0
Design: Stitch — projeto "Design System Integration" (ID `15618719394726153851`)

> **Changelog v3.0 — remoção do OTC:** a **tela de Verificação de Código deixou de existir** (junto com o OTC no backend — ver FEAT-0001 v3.0). O wizard de 6 etapas continua idêntico; o que muda é o destino da etapa 6: ela agora grava a inscrição direto (`POST /candidate/register`) e navega para a tela de Sucesso, sem passo intermediário.
>
> **Consequências para a UI:** removidos a rota `/inscricao/verificar`, o formulário de código (e o componente de input OTP), o estado `pendingId`/`expiresAt` do contexto e todo o tratamento dos erros E5–E9 da v2.0 (expirado, código inválido, excesso de tentativas). O estado que sobrevive é o das respostas do wizard (`sessionStorage`) e o do candidato inscrito (memória, para a tela de Sucesso).
>
> **Também na v3.0 — campo livre na etapa 2:** ao escolher "Outros" em "Como conheceu", o candidato passa a informar por escrito de onde conheceu (`referralSourceOther`).
>
> **Changelog v2.0 (histórico):** a tela única de "Inscrição Pública" virou um wizard de 6 etapas, com questionário novo (como conheceu, MEJ, experiências/motivação, disponibilidade/diversidade). Essa parte permanece válida.

---

## 1. Objetivo

Definir o contrato entre as telas de inscrição pública (projeto Stitch) e a API descrita em FEAT-0001, para que a implementação do front-end saiba exatamente quais dados enviar, o que exibir na resposta e como tratar cada erro — sem redefinir decisões visuais já tomadas no Stitch.

Esta spec **não** descreve cores, tipografia, espaçamento ou copy final — isso é responsabilidade do design system e deve ser extraído diretamente do projeto Stitch linkado acima. Ela descreve o _comportamento_ de cada tela: quais dados ela captura, para qual endpoint envia, o que faz com a resposta, e como reage a cada erro possível.

---

## 2. Atores

- **Ator primário:** candidato, acessando via desktop ou mobile.

**Restrição herdada de FEAT-0001 v3.0:** o candidato não tem login e **não há nenhuma barreira de verificação de identidade** — a UI não deve implementar sessão, token ou confirmação de email/telefone neste fluxo.

---

## 3. Escopo — Telas

O wizard tem **6 etapas**, todas parte da mesma operação de negócio: nenhuma etapa 1–5 chama a API; o `POST /candidate/register` é disparado uma única vez, ao final da etapa 6. Desktop e Mobile não têm diferença funcional, só layout.

| #   | Tela / Etapa                     | Screen ID (Stitch)                 | Endpoint acionado                                   |
| --- | -------------------------------- | ---------------------------------- | --------------------------------------------------- |
| 1   | 1. Dados Pessoais                | `c2013045cd7b40a9bed3d27087977daa` | nenhum (avança para etapa 2)                        |
| 2   | 2. Como conheceu                 | `e80029e997544a8f9f14c975c840c7e4` | nenhum (avança para etapa 3)                        |
| 3   | 3. Movimento EJ                  | `e6966ee78bf4427a9c6e8b06918f4de8` | nenhum (avança para etapa 4)                        |
| 4   | 4. Sobre você                    | `4babeec70a67459a858b13b189058556` | nenhum (avança para etapa 5)                        |
| 5   | 5. Disponibilidade e Diversidade | `b582b23eba31497bbb5b968fb350ec0e` | nenhum (avança para etapa 6)                        |
| 6   | 6. Finalização                   | `0f3e902b4afb4efa898c7af9f45f9ea6` | `POST /candidate/register`                          |
| 7   | Confirmação de Sucesso           | _(reaproveitada da v1.0)_          | nenhum (tela terminal, exibe dados da resposta 4.6) |

**Removida na v3.0:** a tela "Verificação de Código" (rota `/inscricao/verificar`), que existia só para o OTC.

**Screen IDs descartados** (variantes exploradas no Stitch e não seguidas): `d72c8973c52e4ef785e089095fbf9994` e `fcafcbf973014f69b4f1b1efeec75c0d` (variante mobile "chrome iOS" da etapa 5/6) e `203f13aaf6fd4fd89871ef8c2f42542a` (tela única da v1.0, substituída pela etapa 1 do wizard).

Um **indicador de progresso** (stepper com os 6 círculos, numerados e rotulados) aparece no topo de todas as etapas do wizard, mostrando a etapa atual e as concluídas — é decoração/orientação, não captura dado.

---

## 4. Fluxo Principal (telas em sequência)

```gherkin
Como candidato,
Eu preencho os dados das 6 etapas do wizard de inscrição,
Ao enviar a última etapa, minha inscrição é registrada,
E vejo a tela de Confirmação de Sucesso.
```

Cada etapa do wizard tem um botão **Avançar** (avança para a próxima etapa, guardando os dados no estado do wizard — seção 8) e um botão **Voltar** (volta para a etapa anterior sem perder o que já foi preenchido nela). A etapa 1 não tem botão Voltar (não há etapa anterior). Nenhuma etapa 1–5 faz uma chamada de API — a validação de "Avançar" é só client-side (seção 6).

### 4.1 Etapa 1 — Dados Pessoais

- Captura `name`, `email`, `phone`, `course`, `semester`, `gender`.
- "Avançar" valida os campos e move para a etapa 2 — **não** chama a API ainda.

### 4.2 Etapa 2 — Como conheceu

- Captura `referralSource`: um entre `instagram`, `linkedin`, `campus`, `indicacao`, `outros` (seleção única).
- **v3.0:** ao selecionar `outros`, um campo de texto complementar aparece (`referralSourceOther`, obrigatório, máx. 100 caracteres) para o candidato escrever de onde conheceu. O campo só é exibido nessa condição.
- Trocar de `outros` para outra opção **limpa** o texto digitado — o valor não deve ser enviado junto de uma origem diferente de `outros` (o backend o ignoraria de qualquer forma, FEAT-0001 v3.0 seção 8.2).

### 4.3 Etapa 3 — Movimento EJ

- Exibe um vídeo explicativo (URL configurada via env, fora do escopo desta spec) e um texto fixo sobre o Movimento Empresa Júnior.
- Captura `mejAcknowledged`: checkbox "Confirmo que assisti ao vídeo e compreendi o propósito do MEJ" — **obrigatório marcar** para habilitar "Avançar" (o backend também rejeita `false`, FEAT-0001 v3.0 seção 8.2).

### 4.4 Etapa 4 — Sobre você

- Captura `experience` ("Fale um pouco sobre suas experiências, hard e soft skills", textarea, máx. 1000 caracteres) e `motivation` ("Por que você acha que deve fazer parte da CIMATEC jr.", textarea, máx. 500 caracteres).
- Exibe contador de caracteres (`0 / 1000`, `0 / 500`) em tempo real — refletindo os limites do schema compartilhado.

### 4.5 Etapa 5 — Disponibilidade e Diversidade

- Captura `saturdayRestriction` ("Possui restrição em realizar o processo seletivo no sábado?", Sim/Não), `specialNeeds` ("Possui alguma necessidade especial?", Sim/Não) e `ethnicity` (select, enum IBGE + "prefiro não informar" — ver FEAT-0001 v3.0 seção 8.1).

### 4.6 Etapa 6 — Finalização

- Tela final do wizard: exibe aviso de que o candidato deve trazer 1kg de alimento não perecível no dia da seleção, e um link para o grupo do WhatsApp (URL configurada via env; não é uma chamada de API).
- Botão **"Enviar Inscrição"** dispara `POST /candidate/register` (FEAT-0001 v3.0 seção 8.2) com o payload acumulado das 6 etapas.
- Ao submeter com sucesso (`201`), a UI deve:
  - guardar os dados retornados (`id`, `name`, `email`) em estado de cliente **em memória**, para exibir na tela de Sucesso;
  - limpar as respostas do wizard (`sessionStorage`, seção 8) — a inscrição está gravada, não há razão para retê-las;
  - navegar para a tela de Confirmação de Sucesso.
- Em caso de erro (`400`/`409`/`500`), ver seção 7 — como a submissão só acontece aqui, um erro de `email`/`phone` (E1–E5) precisa levar o candidato de volta à etapa 1 para corrigir, mesmo estando na etapa 6.
- **Não pode haver duplo envio:** o botão fica desabilitado enquanto a requisição está em voo. Diferente da v2.0, um segundo envio bem-sucedido criaria uma segunda inscrição de verdade (não existe mais o passo de confirmação para absorver a duplicata).

### 4.7 Tela — Confirmação de Sucesso

- Tela terminal, sem submissão de dados.
- Exibe ao menos `name` e `email` retornados por `register` (`201`, FEAT-0001 v3.0 seção 8.3), confirmando ao candidato qual inscrição foi criada.
- É o **único comprovante** que o candidato recebe (não há email de confirmação — FEAT-0001 v3.0, seção 10, pergunta 7). A copy deve deixar claro que a inscrição está concluída e que nenhuma ação adicional é esperada dele.
- Não deve conter nenhum link/ação que implique uma feature fora de escopo (login, área do candidato, editar inscrição) — nenhuma dessas existe no backend.
- Se o estado em memória não existir (ex.: F5 nesta tela), a UI redireciona para a etapa 1. **A inscrição já foi gravada** — o redirect é só consequência de o estado de exibição ser efêmero; se o candidato refizer o wizard com os mesmos dados, receberá E1/E2 (email/telefone já cadastrado), o que é a sinalização correta de "você já está inscrito".

---

## 5. Estados de UI por tela

| Tela                   | Estados obrigatórios                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Etapas 1–5 do wizard   | idle → validando (client-side) → avança (grava no estado do wizard, seção 8, e navega para a próxima etapa) — nenhuma chamada de rede |
| Etapa 6 (Finalização)  | idle → enviando (loading, botão "Enviar Inscrição" desabilitado) → sucesso (navega) → erro (ver seção 7)                              |
| Confirmação de Sucesso | apenas exibição — sem estado de carregamento (dados já vieram da tela anterior)                                                       |

---

## 6. Validação client-side (antes do POST)

Complementares, não substituem a validação do backend (FEAT-0001 v3.0, seção 5) — servem para dar feedback imediato e evitar round-trips desnecessários. Cada linha é validada no "Avançar" da etapa correspondente:

| Campo                 | Etapa | Validação client-side                                                                                                                                           |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | 1     | não vazio                                                                                                                                                       |
| `email`               | 1     | formato de email; a spec de backend usa "institucional" apenas descritivamente, sem regra formal de domínio — **não bloquear** por domínio no client            |
| `phone`               | 1     | formato de telefone (mesmo padrão aceito pelo backend — E4)                                                                                                     |
| `course`              | 1     | obrigatório, um dos valores do enum `Course` (FEAT-0001 v3.0, seção 8.1)                                                                                        |
| `semester`            | 1     | obrigatório, inteiro entre 1 e 10                                                                                                                               |
| `gender`              | 1     | obrigatório, um dos valores do enum `Gender`                                                                                                                    |
| `referralSource`      | 2     | obrigatório, um dos valores do enum `ReferralSource`                                                                                                            |
| `referralSourceOther` | 2     | **v3.0:** obrigatório e não vazio **se e somente se** `referralSource === "outros"`; máx. 100 caracteres. Nas demais opções não é exibido nem enviado com valor |
| `mejAcknowledged`     | 3     | deve ser exatamente `true` — "Avançar" bloqueia até o checkbox ser marcado                                                                                      |
| `experience`          | 4     | não vazio, máximo 1000 caracteres                                                                                                                               |
| `motivation`          | 4     | não vazio, máximo 500 caracteres                                                                                                                                |
| `saturdayRestriction` | 5     | obrigatório, booleano (Sim/Não)                                                                                                                                 |
| `specialNeeds`        | 5     | obrigatório, booleano (Sim/Não)                                                                                                                                 |
| `ethnicity`           | 5     | obrigatório, um dos valores do enum `Ethnicity` — inclui "prefiro não informar", então sempre há uma opção válida                                               |

> O guard de navegação (que impede pular etapas por URL direta) usa as mesmas regras: a etapa 2 só conta como completa se, em `outros`, o texto complementar estiver preenchido.

---

## 7. Tratamento de erros — Tela → Cenário do backend → Comportamento

Mapeamento dos cenários E1–E6 (FEAT-0001 v3.0, seção 5). Como o `register` só é disparado na etapa 6, **todo** erro de backend aparece ali:

| Cenário (backend)                                | HTTP | Tela                  | Comportamento esperado na UI                                                                                                                                                              |
| ------------------------------------------------ | ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 — Email já cadastrado                         | 409  | Etapa 6 (Finalização) | mensagem indicando o campo (`email`) e um link/botão que volta para a etapa 1 **sem perder os dados das demais etapas** (já estão no estado do wizard, seção 8) para o candidato corrigir |
| E2 — Telefone já cadastrado                      | 409  | Etapa 6 (Finalização) | idem, campo `phone`                                                                                                                                                                       |
| E3 — Email inválido                              | 400  | Etapa 6 (Finalização) | idealmente barrado antes pela validação client-side da etapa 1 (seção 6); se chegar do backend, mesmo tratamento de E1                                                                    |
| E4 — Telefone inválido                           | 400  | Etapa 6 (Finalização) | idem, campo `phone`, mesmo tratamento de E2                                                                                                                                               |
| E5 — Email/telefone em uso (detectado no insert) | 409  | Etapa 6 (Finalização) | indistinguível de E1/E2 do ponto de vista da UI (mesmo `code` e `field`) — mesmo tratamento                                                                                               |
| E6 — "Outros" sem descrição                      | 400  | Etapa 6 (Finalização) | barrado antes pela validação da etapa 2; se chegar do backend, mensagem apontando `referralSourceOther` + CTA de volta para a etapa 2                                                     |

**Erro de rede / timeout / 5xx genérico:** não coberto pela FEAT-0001 (é infraestrutura, não regra de negócio) — tratar com mensagem genérica de "tente novamente" na etapa 6, **sem** limpar o estado local (as respostas do wizard continuam válidas e o candidato pode reenviar).

> ⚠️ **Ponto de atenção herdado da remoção do OTC:** num timeout, a UI não sabe se a inscrição foi gravada ou não. Se o candidato reenviar e a primeira requisição tiver persistido, ele verá E1/E2 (email já cadastrado) — que, nesse contexto, significa "sua inscrição já está registrada". A copy do erro de conflito deve ser escrita levando isso em conta, sem afirmar que houve erro do candidato.

---

## 8. Gerenciamento de estado entre telas

### 8.1 Respostas do wizard (etapas 1–5)

- As respostas acumuladas vivem em estado de aplicação (contexto) **e são espelhadas em `sessionStorage`** a cada "Avançar".
- **Motivação:** um formulário de 6 etapas representa um investimento de preenchimento alto; perder tudo num F5 acidental é um custo grande para o candidato. `sessionStorage` (não `localStorage`) porque expira ao fechar a aba — não fica persistido indefinidamente em disco.
- Nenhum desses campos é dado de autenticação/posse — são só as respostas que o próprio candidato acabou de digitar, então o risco de expor em `sessionStorage` é baixo.
- Devem ser limpas ao concluir o fluxo (sucesso em `register`, seção 4.6) ou ao reiniciar deliberadamente.

### 8.2 Candidato inscrito (resposta do `register`)

- `id`, `name`, `email` retornados pelo `201`: estado de aplicação **em memória apenas** (`useState`/contexto), só para alimentar a tela de Sucesso. Não persistir em storage nem em URL — não há nada a recuperar depois (a inscrição já está no banco e o candidato não tem área logada).
- **v3.0:** `pendingId` e `expiresAt` não existem mais — eram o token de posse temporário do fluxo de OTC.

---

## 9. Fora de Escopo

- Qualquer decisão visual (cor, tipografia, espaçamento, copy exata) — vive no projeto Stitch.
- Verificação de email/telefone na UI (herdado de FEAT-0001 v3.0 — removido deliberadamente).
- Autenticação/login do candidato.
- Edição ou cancelamento da inscrição pelo candidato.
- Telas de erro genéricas do produto (404, manutenção, etc.) — fora do fluxo de registro.
- Internacionalização/idiomas — assume-se pt-BR único.

---

## 10. Dados e Contratos

Esta spec não redefine tipos — reaproveita integralmente os contratos de FEAT-0001 v3.0, seção 8:

- Request `register` (payload completo do wizard): FEAT-0001 v3.0 seção 8.2
- Response `register`: FEAT-0001 v3.0 seção 8.3
- Enums `Course`, `Semester`, `Gender`, `Ethnicity`, `ReferralSource`: FEAT-0001 v3.0 seção 8.1

Qualquer campo que apareça nas telas do Stitch e não esteja nesta lista é uma divergência a ser resolvida antes da implementação.

---

## 11. Critérios de Aceite

- [ ] As 6 etapas do wizard, juntas, capturam exatamente os campos de `register` (FEAT-0001 v3.0 seção 8.2), nem mais nem menos
- [ ] Nenhuma etapa 1–5 chama a API — só a etapa 6 dispara `register`
- [ ] As respostas das etapas 1–5 sobrevivem a um F5 em qualquer etapa do wizard (via `sessionStorage`, seção 8.1)
- [ ] Etapa 2 exibe o campo de texto complementar **apenas** quando "Outros" está selecionado, exige seu preenchimento e o limpa ao trocar de opção
- [ ] Etapa 3 não permite "Avançar" sem o checkbox `mejAcknowledged` marcado
- [ ] Etapa 4 exibe os contadores de caracteres (0/1000, 0/500) refletindo os limites reais do schema
- [ ] O botão "Enviar Inscrição" não permite duplo envio enquanto a requisição está em voo
- [ ] Sucesso em `register` limpa o `sessionStorage` do wizard e navega para a tela de Sucesso
- [ ] Tela de Sucesso exibe apenas dados vindos da resposta de `register`, sem nova chamada de API
- [ ] Nenhuma rota, componente ou estado de verificação de código permanece no código (`/inscricao/verificar`, input OTP, `pendingId`)
- [ ] Todos os cenários E1–E6 têm tratamento definido na etapa 6 (seção 7)
- [ ] Validações client-side (seção 6) não substituem, apenas antecipam, as validações de backend

---

## 12. Notas

- Esta spec assume que o export de código do projeto Stitch será adaptado ao stack do projeto (não copiado literalmente) — a integração com o endpoint descrita aqui (seções 4, 7, 8) é o que deve ser implementado por cima do visual já pronto.
- As telas do Stitch para a etapa 2 não previam o campo de texto em "Outros" (v3.0): ele deve seguir o mesmo padrão visual dos demais inputs do wizard, sem inventar um componente novo.
- Qualquer elemento visual encontrado nas telas do Stitch que sugira uma funcionalidade não coberta por FEAT-0001 (ex: reenvio de código, login, edição pós-inscrição) deve ser tratado como resíduo da v2.0 ou gap a esclarecer — não como liberdade de implementação.
- URLs do vídeo institucional (etapa 3) e do grupo de WhatsApp (etapa 6) são configuração de ambiente, não parte do contrato de dados — ver `front/.env.example`.
