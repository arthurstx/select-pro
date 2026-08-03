# SPEC — Registro de Candidato (Interface / Front-end)

ID: FEAT-0001-UI
Módulo: Registro de candidatos — Camada de UI
Versão: 1.0
Data: 2026-08-01
Status: DRAFT
Depende de: FEAT-0001 (backend) v1.1
Design: Stitch — projeto "Design System Integration" (ID `15618719394726153851`)

---

## 1. Objetivo

Definir o contrato entre as telas de inscrição pública (projeto Stitch) e a API descrita em FEAT-0001, para que a implementação do front-end saiba exatamente quais dados enviar, o que exibir em cada resposta e como tratar cada erro — sem redefinir decisões visuais já tomadas no Stitch.

Esta spec **não** descreve cores, tipografia, espaçamento ou copy final — isso é responsabilidade do design system e deve ser extraído diretamente do projeto Stitch linkado acima. Ela descreve o _comportamento_ de cada tela: quais dados ela captura, para qual endpoint envia, o que faz com a resposta, e como reage a cada erro possível.

> **Nota de acesso:** as 4 telas do Stitch foram referenciadas apenas por ID de projeto/tela; não houve acesso ao conteúdo visual/exportado no momento da escrita desta spec (domínio Stitch fora da rede de execução disponível, e o projeto provavelmente exige autenticação). Os nomes das telas foram usados para inferir a estrutura do fluxo abaixo. Qualquer divergência entre o que está aqui e o que as telas realmente mostram deve ser corrigida antes da implementação — ver seção 12.

---

## 2. Atores

- **Ator primário:** candidato, acessando via desktop ou mobile.

**Restrição herdada de FEAT-0001:** o candidato não tem login; a única barreira de identidade é a confirmação do OTC. A UI não deve implementar nenhum mecanismo de sessão/token para este fluxo.

---

## 3. Escopo — Telas

| #   | Tela                   | Breakpoint | Screen ID (Stitch)                 | Endpoint(s) acionado(s)                             |
| --- | ---------------------- | ---------- | ---------------------------------- | --------------------------------------------------- |
| 1   | Inscrição Pública      | Desktop    | `203f13aaf6fd4fd89871ef8c2f42542a` | `POST /candidate/pre-register`                      |
| 2   | Inscrição Pública      | Mobile     | `e0153c99dc474c88843cdf863571ba72` | `POST /candidate/pre-register`                      |
| 3   | Verificação de Código  | Mobile     | `a005abf8591047f392a448a8d429951e` | `POST /candidate/confirm-otc`                       |
| 4   | Confirmação de Sucesso | —          | `cd628a7f4a6549148591d84e9ff1c793` | nenhum (tela terminal, exibe dados da resposta 4.2) |

**Observação:** não há tela "Verificação de Código (Desktop)" nem uma variante Mobile/Desktop explicitamente separada para "Confirmação de Sucesso" na lista fornecida. Até confirmação, assume-se que as telas 3 e 4 são responsivas e servem os dois breakpoints — ver pergunta aberta na seção 12.1.

---

## 4. Fluxo Principal (telas em sequência)

```gherkin
Como candidato,
Eu preencho meus dados na tela de Inscrição Pública,
Recebo um código por email,
Informo o código na tela de Verificação de Código,
E vejo a tela de Confirmação de Sucesso quando meu cadastro é criado.
```

### 4.1 Tela 1/2 — Inscrição Pública (Desktop / Mobile)

- Formulário captura os campos de `POST /candidate/pre-register` (FEAT-0001, seção 8.2): `name`, `email`, `phone`, `course`, `semester`, `gender`.
- Ao submeter com sucesso (`201`), a UI deve:
  - guardar `pendingId` e `expiresAt` (resposta 8.3 do backend) em estado de cliente (não em URL, não em `localStorage` — ver seção 8);
  - navegar para a tela 3 (Verificação de Código).
- Desktop e Mobile são a mesma operação de negócio — esta spec não distingue comportamento funcional entre os dois, só layout (responsabilidade do Stitch/CSS).

### 4.2 Tela 3 — Verificação de Código (Mobile)

- Campo único visível ao candidato: `code` (o código recebido por email).
- `pendingId` é enviado junto na requisição, mas **não digitado pelo candidato** — deve vir do estado guardado no passo 4.1 (a spec de backend já deixa isso explícito: "não é necessário reenviar o email").
- Ao submeter com sucesso (`200`), a UI deve:
  - guardar os dados retornados (`id`, `name`, `email`) para exibir na tela de sucesso;
  - navegar para a tela 4.
- Ver seção 3 sobre a ausência de uma versão Desktop desta tela — se o fluxo também for acessado via desktop, esta tela precisa responder aos dois breakpoints.

### 4.3 Tela 4 — Confirmação de Sucesso

- Tela terminal, sem submissão de dados.
- Exibe ao menos `name` e `email` retornados por `confirm-otc` (200 OK, FEAT-0001 seção 8.3), confirmando ao candidato qual cadastro foi criado.
- Não deve conter nenhum link/ação que implique uma feature fora de escopo (login, área do candidato) — nenhuma dessas existe no backend atual (FEAT-0001, seção 1).

---

## 5. Estados de UI por tela

| Tela                   | Estados obrigatórios                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| Inscrição Pública      | idle → validando (client-side) → enviando (loading, botão desabilitado) → sucesso (navega) → erro (ver seção 7) |
| Verificação de Código  | idle → enviando → sucesso (navega) → erro (ver seção 7) → **expirado** (ver 7, E5/E9 — exige voltar à tela 1)   |
| Confirmação de Sucesso | apenas exibição — sem estado de carregamento (dados já vieram da tela anterior)                                 |

> **Requisito implícito:** como não há endpoint de reenvio de OTC (FEAT-0001, seção 7, fora de escopo), a tela de Verificação de Código **não pode** ter um botão de "reenviar código" funcional apontando para uma API inexistente. Se o design do Stitch tiver esse elemento visual, ele precisa ou (a) ser removido, ou (b) navegar de volta para a tela 1 e reiniciar um novo pré-registro completo. Ver pergunta 12.2.

---

## 6. Validação client-side (antes do POST)

Complementares, não substituem a validação do backend (FEAT-0001, seção 5, E3/E4) — servem para dar feedback imediato e evitar round-trips desnecessários:

| Campo                        | Validação client-side                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                       | não vazio                                                                                                                                                        |
| `email`                      | formato de email; a spec de backend usa "institucional" apenas descritivamente (seção 8.1), sem regra formal de domínio — **não bloquear** por domínio no client |
| `phone`                      | formato de telefone (mesmo padrão aceito pelo backend — E4)                                                                                                      |
| `course`                     | obrigatório, um dos valores do enum `Course` (FEAT-0001, seção 8.1)                                                                                              |
| `semester`                   | obrigatório, inteiro entre 1 e 10                                                                                                                                |
| `gender`                     | obrigatório, um dos valores do enum `Gender`                                                                                                                     |
| `code` (tela de verificação) | formato esperado do OTC (tamanho/tipo de caractere) — **a definir junto com a decisão de expiração/tentativas, ainda pendente em FEAT-0001 seção 9**             |

---

## 7. Tratamento de erros — Tela → Cenário do backend → Comportamento

Mapeamento direto dos cenários E1–E10 (FEAT-0001, seção 5) para onde e como aparecem na UI:

| Cenário (backend)                                     | HTTP | Tela onde ocorre      | Comportamento esperado na UI                                                                                                                                                |
| ----------------------------------------------------- | ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 — Email já cadastrado                              | 409  | Inscrição Pública     | erro inline no campo `email`, formulário não navega                                                                                                                         |
| E2 — Telefone já cadastrado                           | 409  | Inscrição Pública     | erro inline no campo `phone`                                                                                                                                                |
| E3 — Email inválido                                   | 400  | Inscrição Pública     | idealmente barrado antes pela validação client-side (seção 6); se chegar do backend, erro inline no campo                                                                   |
| E4 — Telefone inválido                                | 400  | Inscrição Pública     | idem, campo `phone`                                                                                                                                                         |
| E5 — OTC expirado/não encontrado                      | 410  | Verificação de Código | mensagem de expiração + CTA para voltar à tela 1 e reiniciar (não há reenvio, seção 5 do backend)                                                                           |
| E6 — OTC inválido                                     | 400  | Verificação de Código | erro inline no campo `code`, permite nova tentativa                                                                                                                         |
| E7 — OTC de tipo incorreto                            | 400  | Verificação de Código | não deveria ocorrer no fluxo normal (é proteção interna, FEAT-0001 seção 8.1); exibir mensagem genérica, sem expor detalhe técnico                                          |
| E9 — Excesso de tentativas                            | 429  | Verificação de Código | mesmo tratamento de E5 — bloqueia e exige novo pré-registro, já que a entrada é invalidada no backend                                                                       |
| E10 — Email/telefone em uso, detectado na confirmação | 409  | Verificação de Código | **atenção:** o backend mantém o KV para nova tentativa, mas o conflito é de email/telefone — a tela de verificação não tem campo para corrigir esse dado. Ver pergunta 12.3 |

**Erro de rede / timeout / 5xx genérico:** não coberto pela FEAT-0001 (é infraestrutura, não regra de negócio) — tratar com mensagem genérica de "tente novamente" em qualquer uma das duas telas de submissão, sem invalidar o estado local (`pendingId` continua válido).

---

## 8. Gerenciamento de estado entre telas

- `pendingId` e `expiresAt`: obtidos na resposta da tela 1, necessários na tela 3. Devem viver em estado de aplicação (contexto/store), **não** em `localStorage`/`sessionStorage` (dado sensível o suficiente para não persistir em disco do navegador sem necessidade) e **não** em query string (evita vazamento em logs de acesso/histórico do navegador).
- Se o candidato atualizar a página (F5) na tela 3, o estado se perde — **comportamento aceito por padrão**, já que a spec de backend não define nenhum mecanismo de recuperação de `pendingId` fora do fluxo (não há endpoint de "buscar pendência por email"). Se esse comportamento for indesejado, é uma pergunta de produto, não uma correção de UI — ver pergunta 12.4.
- `expiresAt`: pode ser usado para exibir um contador regressivo/timer na tela 3 (comum em telas de OTC), mas isso é **decisão visual do Stitch**, não requisito desta spec — só documentamos que o dado está disponível na resposta.

---

## 9. Fora de Escopo

- Qualquer decisão visual (cor, tipografia, espaçamento, copy exata) — vive no projeto Stitch.
- Reenvio de OTC (herdado de FEAT-0001, seção 7).
- Autenticação/login do candidato (herdado de FEAT-0001, seção 1).
- Telas de erro genéricas do produto (404, manutenção, etc.) — fora do fluxo de registro.
- Internacionalização/idiomas — assume-se pt-BR único, como o restante da spec.

---

## 10. Dados e Contratos

Esta spec não redefine tipos — reaproveita integralmente os contratos de FEAT-0001, seção 8:

- Request `pre-register`: FEAT-0001 seção 8.2
- Response `pre-register`: FEAT-0001 seção 8.3
- Request `confirm-otc`: FEAT-0001 seção 8.2
- Response `confirm-otc`: FEAT-0001 seção 8.3
- Enums `Course`, `Semester`, `Gender`: FEAT-0001 seção 8.1

Qualquer campo que apareça nas telas do Stitch e não esteja nesta lista é uma divergência a ser resolvida antes da implementação — ver pergunta 12.1.

---

## 11. Critérios de Aceite

- [ ] Tela 1 (Desktop/Mobile) envia exatamente os campos de `pre-register` (FEAT-0001 seção 8.2), nem mais nem menos
- [ ] `pendingId` e `expiresAt` são persistidos em estado de cliente entre as telas 1 e 3
- [ ] Tela 3 envia `pendingId` + `code` sem exigir reentrada de email
- [ ] Todos os cenários E1–E10 têm tratamento definido em alguma tela (seção 7)
- [ ] Nenhum botão de "reenviar código" funcional existe na tela 3, a menos que implementado como novo pré-registro completo (seção 5)
- [ ] Tela 4 exibe apenas dados vindos da resposta de `confirm-otc`, sem nova chamada de API
- [ ] Validações client-side (seção 6) não substituem, apenas antecipam, as validações de backend

---

## 12. Perguntas em Aberto

| #   | Pergunta                                                                                                                                                                         | Status                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | As telas 3 (Verificação) e 4 (Sucesso) atendem Desktop e Mobile pelo mesmo layout responsivo, ou faltam variantes Desktop no projeto Stitch?                                     | Pendente — confirmar com design                                                              |
| 2   | A tela de Verificação de Código tem algum elemento visual de "reenviar código"? Se sim, qual ação ele deve disparar, já que não existe endpoint de reenvio (FEAT-0001, seção 7)? | Pendente — depende de inspeção visual das telas                                              |
| 3   | No cenário E10 (conflito detectado só na confirmação), o candidato deve voltar para a tela 1 para corrigir email/telefone, ou existe alguma tela intermediária de correção?      | Pendente — não coberto pelo design fornecido                                                 |
| 4   | Perder o `pendingId` ao atualizar a página (F5) na tela 3 é aceitável, ou o produto espera algum tipo de recuperação (ex: reenviar email de "continuar cadastro")?               | Pendente — decisão de produto; pode implicar um novo endpoint de backend                     |
| 5   | Formato exato do `code` (quantidade de dígitos/caracteres) para calibrar a validação client-side da seção 6                                                                      | Pendente — depende da decisão em FEAT-0001 seção 9 (expiração/tentativas), ainda não fechada |

---

## 13. Notas

- Esta spec assume que o export de código do projeto Stitch será adaptado ao stack do projeto (não copiado literalmente) — a integração com os endpoints descrita aqui (seções 4, 7, 8) é o que deve ser implementado por cima do visual já pronto.
- Qualquer elemento visual encontrado nas telas do Stitch que sugira uma funcionalidade não coberta por FEAT-0001 (ex: reenvio de código, login, edição pós-confirmação) deve ser tratado como gap a esclarecer antes de codar — não como liberdade de implementação.
- Assim que o conteúdo real das 4 telas estiver disponível (screenshot ou export), a seção 3 e as perguntas da seção 12 devem ser revisadas e fechadas antes de considerar esta spec pronta para implementação.
