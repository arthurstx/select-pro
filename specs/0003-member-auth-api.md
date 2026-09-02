# SPEC — Cadastro e Autenticação de Membro

ID: FEAT-0003
Módulo: Acesso à aplicação (membros da CIMATEC jr)
Versão: 1.2
Data: 2026-08-06
Status: APPROVED

> **Changelog v1.2 — recuperação de senha entra no escopo, e o Resend volta ao projeto.** O que era FEAT-0004 passa a fazer parte desta spec: `POST /auth/forgot-password` e `POST /auth/reset-password`, com email enviado via Resend fora do caminho crítico (`waitUntil`) e **sem fila**. Com isso o provedor de email, removido na FEAT-0001 v3.0, volta a ser dependência do projeto — mas de um fluxo cujo dono é um membro identificado, não do fluxo público de inscrição, que segue sem nenhuma dependência externa.
>
> **A troca de senha pelo usuário logado continua fora de escopo** (decisão explícita). Consequência a registrar: o **único** caminho para trocar de senha passa a ser o "esqueci minha senha" — inclusive para quem lembra da senha e só quer trocá-la. Ver seção 13.
>
> **Também na v1.2:**
>
> - **Elegibilidade vira lista, não valor único.** A regra deixa de comparar com `"active"` e passa a consultar `ELIGIBLE_MEMBER_STATUSES` em `shared`. O conteúdo da lista hoje é **apenas `["active"]`** — a estrutura existe porque a política de quem pode entrar é a parte desta spec com maior chance de mudar, e a mudança precisa custar uma linha, não uma refatoração (seção 9).
> - **`manager` não define mais papel.** Todo mundo se cadastra como `avaliador`; promoção a `admin` é manual. Isso desacopla o papel na aplicação da hierarquia da empresa e resolve a pergunta do "primeiro admin" (seção 10, perguntas 4 e 5).
>
> **Changelog v1.1 — orçamento de CPU do plano Free:** confirmado que o Worker roda no **plano Free**, com teto de **10 ms de CPU por invocação**. Isso não afeta as chamadas externas (I/O não conta como CPU time), mas afeta diretamente o único trecho de CPU pura do fluxo: a derivação da senha. As iterações do PBKDF2 caem para uma faixa que cabe no teto — bem abaixo do recomendado — e essa perda de robustez é um **risco explicitamente aceito** enquanto o projeto estiver no plano Free (ver seção 13). O formato do hash guarda as iterações usadas, então o custo pode subir sem migration e sem troca de senha no dia em que o plano mudar (seção 9, "Reforço do hash").
>
> **Também na v1.1:**
>
> - `status` do membro é validado como **enum Zod fechado** — adicionar um status novo é uma linha em `shared`. Um valor fora do enum reprova a elegibilidade (E3), não vira erro de indisponibilidade (seção 8.1).
> - Confirmado que a tabela `members` na Supabase **não tem** o CHECK de `status` (seção 10, pergunta 1).
> - Política de senha permanece em **8 caracteres** (seção 8.2), alinhada ao `UserSchema` que já existe em `shared`.
> - Recuperação de senha volta a existir com o Resend, **sem fila** — Cloudflare Queues exige plano pago, e o fluxo não precisa de fila (seção 10, pergunta 8).

> **Contexto:** até aqui a aplicação só tinha um fluxo público e sem identidade (a inscrição do candidato, FEAT-0001). Nada do que vem depois — avaliar candidato, montar grupos, ver inscrições sem depender da planilha do FEAT-0002 — existe sem saber **quem** está do outro lado. Esta feature cria a porta de entrada: o membro da CIMATEC jr se cadastra na aplicação, define uma senha e passa a ter sessão.
>
> **A regra que dá forma à feature:** não é um cadastro aberto. Só se cadastra quem já é membro da empresa, e a lista de membros **não vive aqui** — vive no banco da tec, na Supabase. O cadastro é, portanto, uma checagem contra um sistema externo antes de criar qualquer coisa no D1.
>
> **Decisão registrada — Passport.js não é viável neste runtime.** Foi considerado e descartado. Passport é middleware Connect/Express: monkey-patcha o `req` do Node (`req.logIn`, `req.user`, `req.session`), depende de `http.IncomingMessage`/`ServerResponse` e, para sessão, do `express-session`. Um Cloudflare Worker tem apenas `Request`/`Response` da Fetch API dentro do `Context` do Hono — não existe o par `req`/`res` no qual o Passport se acopla. O `passport-jwt` ainda depende do `jsonwebtoken`, que usa APIs de `crypto` do Node cobertas só parcialmente pelo `nodejs_compat`. Não é custo de integração: não há caminho suportado sem tirar a autenticação do Worker e rodá-la num deploy Node separado. O substituto é `hono/jwt` + `jose` — `jose` **já é dependência** do `api/` (assina o JWT da service account no FEAT-0002) e roda sobre WebCrypto, nativo do runtime.

---

## 1. Objetivo

Permitir que um membro da CIMATEC jr crie sua conta na aplicação e se mantenha autenticado entre requisições.

O membro informa email e senha. O sistema verifica se aquele email consta como membro **ativo** no banco da tec (Supabase), e só então cria o usuário no D1 — importando junto os dados que a tec já tem sobre ele (nome, telefone, curso, semestre, etc.), para que ele não precise redigitar nada que a empresa já sabe. A partir daí, login, renovação de sessão e logout passam a existir.

O banco da tec é a **fonte da verdade sobre quem é membro**; o D1 é a fonte da verdade sobre **quem tem conta na aplicação**. São coisas diferentes e esta spec mantém a separação explícita.

A spec cobre também o que fazer quando o membro esquece a senha — o único caminho de troca de credencial que vai existir (seção 4.6).

**Fora do escopo desta spec:** a interface do cadastro e do login (virá em FEAT-0003-UI), autorização por papel nas rotas de negócio (avaliação, grupos), e troca de senha pelo usuário logado (ver seção 7 e a nota da seção 13).

---

## 2. Atores

- **Ator primário:** membro da CIMATEC jr (já cadastrado no banco da tec, ainda sem conta na aplicação)
- **Ator secundário:** o banco da tec na Supabase — consultado, nunca escrito

**Restrição:** o candidato do FEAT-0001 **não** participa deste fluxo e continua sem conta. As duas identidades não se cruzam: `candidates` e `users` são tabelas independentes, e um mesmo email pode existir nas duas sem conflito (um membro pode ter sido candidato num processo anterior).

---

## 3. User Story

```gherkin
Como membro da CIMATEC jr,
Eu quero criar minha conta na aplicação usando o email que já está
cadastrado na empresa e me manter logado,
Para eu poder acessar as áreas internas do processo seletivo.
```

```gherkin
Como responsável pelo processo seletivo,
Eu quero que só quem é membro ativo da empresa consiga criar conta,
Para que ninguém de fora acesse dados de candidatos.
```

---

## 4. Fluxo Principal (Happy Path)

> Esta spec cobre apenas a camada de API/backend. As telas (cadastro, login, estado de sessão no front) estão em FEAT-0003-UI.

Todas as rotas ficam sob o prefixo `/auth`.

### 4.1 Cadastro — `POST /auth/register`

1. Membro envia `email` e `password` (seção 8.2).
2. Sistema valida o formato do payload e **normaliza o email** (trim + lowercase). O email normalizado é o que vale para consulta e persistência.
3. Sistema consulta o D1: já existe `users.email` igual? Se sim, para aqui (E1).
4. Sistema consulta o banco da tec na Supabase pelo email (seção 9, "Consulta ao diretório"):
   - nenhuma linha → não é membro, para aqui (E2);
   - linha com `status !== "active"` → membro não elegível, para aqui (E3);
   - erro de rede, timeout ou resposta não-2xx da Supabase → para aqui com `503` (E5). **Nenhum usuário é criado quando o diretório não pôde ser consultado** — o fluxo falha fechado.
5. Sistema deriva o hash da senha (PBKDF2/WebCrypto, seção 9).
6. Sistema define o papel do usuário como `avaliador` — **sempre**, para todo cadastro (seção 9, "Papel do usuário").
7. Sistema grava, **no mesmo batch D1**: a linha em `users` (identidade + credencial + papel), a linha em `member_profiles` (snapshot dos dados vindos da tec) e a linha em `sessions` (a sessão recém-criada). As três entram juntas ou nenhuma entra.
8. Sistema responde `201 Created` com o access token e os dados do usuário, e envia o refresh token no cookie `Set-Cookie` (seção 9, "Transporte da sessão").

> **Cadastro já autentica.** O membro acabou de provar a posse da senha que ele mesmo definiu — exigir um login imediatamente depois seria um round-trip sem ganho de segurança, e criaria o estado intermediário "cadastrado mas não logado", que não tem representação útil no domínio. Mesmo raciocínio que eliminou o estado pendente no FEAT-0001 v3.0.

### 4.2 Login — `POST /auth/login`

1. Membro envia `email` e `password`.
2. Sistema normaliza o email e busca o usuário no D1.
3. Sistema verifica a senha contra o hash armazenado.
   - Usuário inexistente **e** senha incorreta produzem exatamente a mesma resposta (E7). O login não revela se o email existe.
4. Se `users.deactivated_at` estiver preenchido, o login é negado (E12).
5. Sistema cria uma nova sessão em `sessions` e responde `200 OK` com o access token + cookie de refresh.

> **O login não consulta a Supabase.** Decisão da seção 9: o diretório da tec só é consultado no cadastro. Uma indisponibilidade da Supabase não pode impedir quem já tem conta de entrar.

### 4.3 Renovação — `POST /auth/refresh`

1. Cliente chama a rota sem corpo; o refresh token viaja no cookie.
2. Sistema calcula o hash do token recebido e procura a sessão correspondente em `sessions`.
   - não encontrada → E9;
   - expirada → E9;
   - **já revogada** → reuso de token: revoga a família inteira e responde E10.
3. Sistema **rotaciona**: marca a sessão atual como revogada e cria uma nova linha, na mesma `family_id`, com um novo refresh token.
4. Sistema responde `200 OK` com um novo access token e o novo cookie de refresh.

### 4.4 Logout — `POST /auth/logout`

1. Cliente chama a rota; o refresh token viaja no cookie.
2. Sistema revoga a sessão correspondente (e as demais da mesma família).
3. Sistema responde `204 No Content` e envia o cookie com `Max-Age=0` para apagá-lo no navegador.

> Logout é **idempotente**: cookie ausente, inválido ou já revogado também responde `204`. Não há informação útil em distinguir esses casos, e um erro aqui só atrapalharia o front a limpar o próprio estado.

### 4.5 Sessão atual — `GET /auth/me`

1. Cliente envia o access token em `Authorization: Bearer <token>`.
2. Middleware valida a assinatura e a expiração do token (E11).
3. Sistema lê o usuário no D1 (juntando `member_profiles`) e responde `200 OK`.

> `/auth/me` lê o banco em vez de devolver só o conteúdo do token: é a rota que o front usa para reidratar a sessão ao recarregar a página, e nesse momento ele precisa dos dados atuais, não do que estava no token emitido 15 minutos antes.

### 4.6 Pedido de recuperação — `POST /auth/forgot-password`

1. Membro envia o email.
2. Sistema normaliza e busca o usuário no D1.
3. **Independentemente do resultado**, responde `202 Accepted` com a mesma mensagem. Esta rota não tem cenário de erro visível ao cliente: email desconhecido, membro desativado e falha no envio produzem a mesma resposta.
4. Se o usuário existir e estiver ativo, antes de responder o sistema:
   - invalida os tokens de recuperação anteriores ainda válidos daquele usuário;
   - gera um token opaco de 32 bytes, grava o **hash** em `password_reset_tokens` com validade de 30 minutos;
   - agenda o envio do email via Resend com `c.executionCtx.waitUntil()` — a resposta **não** espera o provedor.

> **A resposta é sempre a mesma.** Se `forgot-password` respondesse `404` para email desconhecido, ele viraria um verificador de contas — e diferente do `register` (que já é um oracle assumido, seção 13), aqui não há nenhum benefício em compensação: o membro legítimo digitou o próprio email e não precisa ser informado de que ele existe.
>
> **O envio sai do caminho crítico.** O `waitUntil` mantém a latência independente do Resend. O que ele não dá é garantia de entrega: se o provedor estiver fora no instante do envio, aquele email se perde e o membro precisa pedir de novo. Aceito nesta versão (seção 9).

### 4.7 Redefinição — `POST /auth/reset-password`

1. Membro envia o token (que veio no link do email) e a nova senha.
2. Sistema calcula o hash do token e procura em `password_reset_tokens`:
   - não encontrado, expirado ou já usado → E15;
3. Sistema valida a nova senha contra `PasswordSchema`, deriva o novo hash e grava.
4. Sistema marca o token como usado e **revoga todas as sessões do usuário** (`sessions`), em batch com a troca do hash.
5. Sistema responde `204 No Content`. O membro precisa entrar de novo com a senha nova.

> **Revogar todas as sessões é o ponto do fluxo.** Quem redefine a senha ou esqueceu dela, ou desconfia que alguém a tem. Nos dois casos, deixar as sessões antigas vivas anula o motivo da troca — um invasor com refresh token válido continuaria dentro por até 7 dias. Isso torna `reset-password` a única forma de expulsar todo mundo de uma conta, o que é relevante porque não há tela de "sessões ativas" (seção 7).
>
> O token é de **uso único** e some ao ser usado: um link de recuperação que continua funcionando é um link que vale para sempre na caixa de entrada de quem tiver acesso a ela depois.

---

## 5. Fluxos Alternativos e Erros

| #    | Cenário                                    | Condição                                                                                     | Ação                                                                    | Código HTTP                |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| E1   | Email já tem conta na aplicação            | `users.email` já existe (checagem prévia)                                                    | bloquear cadastro, apontando o campo `email`                             | `409 Conflict`             |
| E2   | Email não é de membro                      | nenhuma linha em `members` (Supabase) para o email                                           | bloquear cadastro                                                        | `403 Forbidden`            |
| E3   | Membro não elegível pelo status            | linha encontrada, mas `status` fora de `ELIGIBLE_MEMBER_STATUSES` — hoje tudo que não for `active` (`inactive`, `alumni`, `on_leave` ou valor desconhecido) | bloquear cadastro, com mensagem orientando procurar a diretoria           | `403 Forbidden`            |
| E4   | Payload inválido                           | email mal formatado ou senha fora da política (seção 8.2)                                    | bloquear, apontando o campo                                              | `400 Bad Request`          |
| E5   | Diretório da tec indisponível              | timeout, erro de rede ou resposta não-2xx da Supabase                                        | bloquear cadastro **sem criar nada**; mensagem de "tente novamente"       | `503 Service Unavailable`  |
| E6   | Corrida no insert                          | duas requisições simultâneas com o mesmo email passam pela checagem do passo 3 e a constraint `unique` de `users.email` barra a segunda | inspecionar a constraint violada e devolver o mesmo erro de E1           | `409 Conflict`             |
| E7   | Credenciais inválidas                      | email inexistente **ou** senha incorreta no login                                            | negar, com resposta **idêntica** nos dois casos                          | `401 Unauthorized`         |
| E8   | Refresh ausente                            | `POST /auth/refresh` sem o cookie                                                            | negar                                                                    | `401 Unauthorized`         |
| E9   | Refresh inválido ou expirado               | token não encontrado em `sessions` ou `expires_at` no passado                                | negar e limpar o cookie                                                  | `401 Unauthorized`         |
| E10  | Reuso de refresh token                     | token apresentado corresponde a uma sessão **já revogada**                                   | revogar a família inteira (`family_id`), limpar o cookie e negar          | `401 Unauthorized`         |
| E11  | Access token ausente/inválido/expirado     | rota protegida sem `Authorization` válido                                                    | negar, com `code` distinto para expirado vs. inválido (ver abaixo)        | `401 Unauthorized`         |
| E12  | Usuário desativado                         | `users.deactivated_at` preenchido, no login ou no refresh                                    | negar e revogar todas as sessões do usuário                              | `401 Unauthorized`         |
| E13  | Excesso de tentativas                      | rate limit atingido em `/auth/*`                                                              | bloquear no edge (WAF), antes do Worker                                  | `429 Too Many Requests`    |
| E14  | Token de recuperação inválido              | token não encontrado, expirado ou já usado em `/auth/reset-password`                          | negar, sem revelar qual das três condições ocorreu                       | `400 Bad Request`          |
| E15  | Nova senha inválida                        | senha fora da política em `/auth/reset-password`                                              | negar, apontando o campo `password`                                      | `400 Bad Request`          |

> **E11 precisa de dois códigos distintos.** `TOKEN_EXPIRED` diz ao front "chame `/auth/refresh` e repita a requisição"; `INVALID_TOKEN` diz "a sessão acabou, mande o usuário para o login". Colapsar os dois num `401` genérico faz o front tratar expiração normal (que acontece a cada 15 minutos) como fim de sessão — o usuário seria deslogado o tempo todo. Isso é requisito funcional, não detalhe.
>
> **E2 e E3 são deliberadamente distintos.** Quem não é membro e quem é membro afastado precisam de orientações diferentes. O custo dessa distinção está registrado na seção 13 (enumeração).

---

## 6. Critérios de Aceite

- [ ] Só cria conta quem tem email correspondente a um membro com `status === "active"` no banco da tec
- [ ] Email é normalizado (trim + lowercase) antes de consultar a Supabase, antes de checar duplicidade e antes de persistir
- [ ] Falha ao consultar a Supabase (timeout, rede, não-2xx) resulta em `503` e **nenhuma** escrita no D1
- [ ] A `service_role` key da Supabase vive como secret do Worker e nunca aparece em resposta, log ou `wrangler.jsonc`
- [ ] `users`, `member_profiles` e `sessions` são criados atomicamente no cadastro — nunca um sem os outros
- [ ] Senha é persistida apenas como hash PBKDF2 com salt por usuário; a senha em claro não aparece em nenhum log
- [ ] `POST /auth/register` e `POST /auth/login` rodam dentro dos 10 ms de CPU do plano Free, **medido no Worker em produção** (não em `wrangler dev`)
- [ ] O hash armazenado carrega o número de iterações usado, permitindo elevá-lo depois sem migration
- [ ] Login com email inexistente e login com senha errada produzem resposta byte a byte idêntica
- [ ] Access token expira em 15 minutos e é aceito apenas via header `Authorization: Bearer`
- [ ] Refresh token é opaco, viaja apenas em cookie `HttpOnly` e é armazenado no D1 **como hash**, nunca em claro
- [ ] Cada `/auth/refresh` rotaciona o refresh token; o anterior deixa de funcionar
- [ ] Reuso de um refresh token já rotacionado revoga a família inteira de sessões
- [ ] `POST /auth/logout` é idempotente e sempre responde `204`
- [ ] Token expirado e token inválido retornam `code`s diferentes
- [ ] Todo cadastro cria o usuário com papel `avaliador`, independentemente do `manager` vindo da tec
- [ ] A elegibilidade por status é lida de `ELIGIBLE_MEMBER_STATUSES`, não de uma comparação literal com `"active"`
- [ ] `POST /auth/forgot-password` responde `202` idêntico para email existente e inexistente, e não bloqueia esperando o Resend
- [ ] Token de recuperação é de uso único, expira em 30 min e é armazenado como hash
- [ ] `POST /auth/reset-password` bem-sucedido revoga **todas** as sessões do usuário
- [ ] Falha no envio do email não altera a resposta ao membro nem impede pedidos futuros
- [ ] Nenhum tipo de request/response de auth é declarado fora de `shared/src/schemas`

---

## 7. Fora de Escopo

- Interface de cadastro e login (FEAT-0003-UI)
- Autorização por papel nas rotas de negócio — esta spec **emite** o papel no token e no `/auth/me`; quem consome e decide o que cada papel pode fazer é responsabilidade das specs de avaliação/grupos
- **Troca de senha pelo usuário logado** (`POST /auth/change-password`) — decisão explícita. O único caminho de troca é o "esqueci minha senha" da seção 4.6; ver a consequência na seção 13
- Promoção de papel pela aplicação — `admin` só nasce de `UPDATE` manual no D1
- Tela de "sessões ativas" / logout remoto de outros dispositivos (a tabela `sessions` já suporta, a rota não existe nesta versão)
- Sincronização contínua dos dados do membro com a Supabase — o snapshot é tirado uma vez, no cadastro
- Login social / OAuth
- Cadastro de membro **na tec** (isso acontece na Supabase, fora desta aplicação)

---

## 8. Dados e Modelos

### 8.1 TypeScript Schema

```ts
// ------------------------------------------------------------
// Origem externa: banco da tec (Supabase). NÃO é uma tabela nossa —
// é o shape da resposta do PostgREST, e o único acoplamento da
// aplicação ao schema da tec. Vive em shared para que a validação
// da resposta externa use o mesmo contrato do resto do sistema.
// ------------------------------------------------------------
type MemberStatus = "active" | "inactive" | "alumni" | "on_leave";

// Quem pode criar conta. É uma LISTA de um elemento só, e não uma
// comparação com "active", de propósito: esta é a regra da spec com maior
// chance de mudar, e o formato garante que mudá-la custe uma linha — sem
// tocar em service, rota ou banco.
//
// `on_leave` (afastado) e `alumni` (ex-membro) ficam de fora por ora. O
// caminho provável para eles não é entrar nesta lista, e sim um fluxo de
// liberação por admin — ver seção 10, pergunta 3.
const ELIGIBLE_MEMBER_STATUSES = ["active"] as const;

// ATENÇÃO: três nomes aqui NÃO são os nomes das colunas na tec. A tradução
// acontece no `?select=` do PostgREST (`nosso:deles`) — ver seção 9. Os nomes
// abaixo são os que valem no resto do sistema, inclusive em `member_profiles`.
//
//   full_name   <- name
//   birth_date  <- birth_data   (typo na origem)
//   updated_at  <- update_at    (typo na origem)
interface TecMember {
  id: string;                // uuid — PK da tabela na tec
  full_name: string;         // alias de `name`
  email: string;
  phone: string;
  birth_date: string | null; // alias de `birth_data`; DATE, ISO-8601
  course: string;            // TEXT livre na origem — ver ponto de atenção abaixo
  semester: number;
  gender: string;            // TEXT livre na origem
  ethnicity: string;         // TEXT livre na origem
  status: string | null;     // TEXT livre E nullable — ver ponto de atenção abaixo
  manager: boolean;
  created_at: string;
  updated_at: string | null; // alias de `update_at`; null enquanto nunca editado
}

// ------------------------------------------------------------
// D1 — `users` (tabela existente, ganha uma coluna)
// ------------------------------------------------------------
interface UserRow {
  id: string;      // UUID v4 gerado no insert
  role_id: string; // FK -> roles.id

  email: string;   // unique, sempre normalizado (lowercase)
  name: string;
  password: string | null; // hash PBKDF2 no formato da seção 9

  /** Novo em FEAT-0003 — desativação manual. `null` = ativo. */
  deactivated_at: string | null;

  created_at: string;
  updated_at: string | null;
}

// ------------------------------------------------------------
// D1 — `member_profiles` (nova). Snapshot 1:1 do que a tec sabe
// sobre o membro no momento do cadastro. Mesmo padrão de
// `candidates` + `candidate_applications` (FEAT-0001): identidade e
// credencial ficam em `users`, o resto sai de lá.
// ------------------------------------------------------------
interface MemberProfileRow {
  id: string;
  user_id: string;   // FK unique -> users.id (garante o 1:1)
  member_id: string; // unique — uuid do membro na Supabase, a única chave de correlação

  full_name: string;
  phone: string;
  birth_date: string | null;
  course: string;
  semester: number;
  gender: string;
  ethnicity: string;
  status: MemberStatus; // valor no momento do cadastro; não é atualizado depois
  manager: boolean;

  /** Quando o snapshot foi tirado. Deixa explícito o quão velho o dado é. */
  synced_at: string;

  created_at: string;
  updated_at: string | null;
}

// ------------------------------------------------------------
// D1 — `sessions` (nova). Uma linha por refresh token emitido.
// ------------------------------------------------------------
interface SessionRow {
  id: string;      // UUID v4 — vai no claim `sid` do access token
  user_id: string; // FK -> users.id, ON DELETE CASCADE

  /** SHA-256 (hex) do refresh token opaco. O token em claro nunca é gravado. */
  refresh_token_hash: string;
  /** Agrupa a cadeia de rotações originada de um mesmo login. */
  family_id: string;

  expires_at: string;
  /** Preenchido na rotação, no logout ou na detecção de reuso. */
  revoked_at: string | null;

  user_agent: string | null;

  created_at: string;
}

// ------------------------------------------------------------
// D1 — `password_reset_tokens` (nova). Uma linha por pedido de
// recuperação. Mesma disciplina de `sessions`: o token em claro
// só existe no email do membro, nunca no banco.
// ------------------------------------------------------------
interface PasswordResetTokenRow {
  id: string;
  user_id: string; // FK -> users.id, ON DELETE CASCADE

  /** SHA-256 (hex) do token opaco enviado no link do email. */
  token_hash: string;

  expires_at: string;  // created_at + 30 min
  /** Preenchido no uso e na invalidação por um pedido mais novo. Uso único. */
  used_at: string | null;

  created_at: string;
}

// ------------------------------------------------------------
// Conteúdo do access token (JWT, HS256)
// ------------------------------------------------------------
interface AccessTokenClaims {
  sub: string;   // users.id
  email: string;
  role: string;  // roles.value — "avaliador" para todo cadastro; "admin" só por promoção manual
  sid: string;   // sessions.id que originou este token
  iat: number;
  exp: number;   // iat + 15min
}
```

**Pontos de atenção para quem for implementar:**

- **Os enums da tec não são os nossos.** `course`, `gender` e `ethnicity` são `TEXT` livre na Supabase, enquanto a aplicação tem enums fechados (`Course`, `Gender`, `Ethnicity` em `database.schema.ts`). É esperado que os valores **não** coincidam (`"Engenharia de Computação"` lá vs. `"eng-computacao"` aqui). Por isso `member_profiles` guarda os valores **como vieram**, sem CHECK e sem conversão: aplicar nossas constraints a dados de um sistema que não controlamos faria o cadastro falhar por um dado que o membro não tem como corrigir. Se algum dia a aplicação precisar filtrar ou agregar por curso, a normalização acontece na leitura, com um mapa em `shared` — mesma linha de raciocínio que tirou o CHECK de `candidates.course` na v3.1.
- **`status` vindo da Supabase não tem restrição no banco de origem (confirmado na v1.1; nullability confirmada no schema de produção).** A coluna é `TEXT` livre **e NULLABLE** — o CHECK que aparecia no DDL de referência nunca foi criado. Portanto `MemberStatus` é o conjunto de valores *esperados*, não um conjunto *garantido*: a API pode receber um valor fora da lista, ou `null`. Por isso `TecMemberSchema.status` é `z.string().nullable()` e `isEligibleMemberStatus` aceita `string | null`: se o schema fosse estrito, um `null` viraria erro de parse e o membro receberia 503 em vez de 403 — exatamente a inversão que o parágrafo seguinte proíbe. O tratamento é **fail-closed** — qualquer valor diferente de `"active"` bloqueia o cadastro (E3), inclusive um valor desconhecido. Isso não é uma precaução redundante: é a única barreira que existe, já que a origem não valida nada.
- **`status` é enum Zod fechado (`MemberStatusSchema`), e um valor fora dele reprova a elegibilidade, não a requisição.** O enum é o que documenta os valores esperados e torna a manutenção trivial: se a tec criar um `suspended`, basta acrescentar o literal em `shared`. Mas o parse do `status` não pode derrubar o parse do membro inteiro — um status desconhecido significa "não sei se essa pessoa pode entrar", e a resposta correta a isso é E3 (`403`, não elegível), não E5 (`503`, "tente novamente"). Na prática: valide o `status` de forma isolada (`safeParse` no campo, ou `.catch()` para um valor sentinela não-ativo) e deixe o resto do `TecMemberSchema` estrito. Sem esse cuidado, o membro recebe "serviço indisponível" para um problema que não é transitório e que nenhuma nova tentativa resolve.
- **`member_id` é a única chave de correlação com a tec.** O email pode mudar; o `id` da Supabase, não. Guardá-lo é o que permite uma futura resincronização (fora de escopo aqui) sem depender de casar strings.
- **`users.name` e `member_profiles.full_name` são a mesma informação em dois lugares.** `users.name` existe desde a 0001 e é o que a aplicação exibe; `full_name` é o valor cru do snapshot. Ambos são preenchidos com o mesmo valor no cadastro e podem divergir depois, se a aplicação permitir edição do nome de exibição — que é justamente o ponto de manter os dois.
- **A tabela `roles` está vazia desde a 0001.** Não há nenhum seed. A migration desta feature precisa inserir os papéis antes que qualquer `users.role_id` possa apontar para algo (a FK é `ON DELETE RESTRICT`).
- **`ALTER TABLE users ADD COLUMN deactivated_at` é seguro no D1** — SQLite adiciona coluna sem recriar a tabela. Isto **não** é o caso perigoso descrito na 0004 (`CONTEXT.md`), que envolvia reconstruir uma tabela com filhos em CASCADE. Nenhuma tabela é reconstruída aqui.

**Migration esperada (`0005-member-auth.sql`), em esboço:**

```sql
INSERT INTO roles (id, value) VALUES ('admin', 'admin'), ('avaliador', 'avaliador');

ALTER TABLE users ADD COLUMN deactivated_at TEXT;

CREATE TABLE member_profiles (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL UNIQUE,   -- uuid da tec, não inteiro
  full_name TEXT NOT NULL,
  phone     TEXT NOT NULL,
  birth_date TEXT,
  course    TEXT NOT NULL,
  semester  INTEGER NOT NULL,
  gender    TEXT NOT NULL,
  ethnicity TEXT NOT NULL,
  status    TEXT NOT NULL,
  manager   INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

CREATE TABLE sessions (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_family ON sessions(family_id);
CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_id);
```

> `roles.id` usa o próprio slug como chave (`'admin'`, `'avaliador'`) em vez de UUID: o papel é referenciado por nome no código e no token, e um id legível dispensa um join só para descobrir qual papel é qual no cadastro.

### 8.2 Request Bodies

**`POST /auth/register`**

```json
{
  "email": "string",
  "password": "string"
}
```

> **Política de senha:** mínimo de 8 caracteres — o mesmo já usado por `UserSchema` em `shared` —, máximo de 128. O máximo existe para limitar o custo do PBKDF2: sem ele, uma senha de 1 MB vira um vetor de consumo de CPU num runtime com teto de 10 ms. Não há exigência de caracteres especiais/maiúsculas: regras de composição empurram o usuário para senhas previsíveis (`Senha@123`) sem ganho real de entropia.
>
> `PasswordSchema` vive em `auth.schema.ts` e é a fonte única da regra; `UserSchema.password` deve passar a reusá-lo em vez de repetir o `min(8)`, para que uma futura mudança de política tenha um só lugar para acontecer.
>
> ⚠️ O mínimo de 8 combinado com as iterações reduzidas de PBKDF2 (seção 9) é o ponto mais fraco do sistema, e é uma **escolha consciente** enquanto o projeto estiver no plano Free — ver seção 13.
>
> **Nenhum dado pessoal é aceito no cadastro.** Nome, telefone, curso, semestre, gênero e etnia vêm exclusivamente da Supabase. Se o cliente enviar esses campos, eles são ignorados. Aceitá-los abriria a possibilidade de o membro se cadastrar com dados diferentes dos que a tec tem, e a tec é a fonte da verdade.

**`POST /auth/login`**

```json
{
  "email": "string",
  "password": "string"
}
```

**`POST /auth/forgot-password`**

```json
{ "email": "string" }
```

**`POST /auth/reset-password`**

```json
{
  "token": "string (veio no link do email)",
  "password": "string (nova senha, mesma política)"
}
```

**`POST /auth/refresh`** e **`POST /auth/logout`**: sem corpo. A credencial é o cookie.

**`GET /auth/me`**: sem corpo. Requer `Authorization: Bearer <access_token>`.

### 8.3 Responses — Sucesso

**`POST /auth/register` (`201 Created`) e `POST /auth/login` (`200 OK`)** — mesmo envelope:

```json
{
  "data": {
    "accessToken": "string (JWT)",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "string",
      "name": "string",
      "role": "avaliador"
    }
  }
}
```

```http
Set-Cookie: refresh_token=<opaco>; HttpOnly; Secure; SameSite=None; Path=/auth; Max-Age=604800
```

**`POST /auth/refresh` (`200 OK`)**

```json
{
  "data": {
    "accessToken": "string (JWT)",
    "expiresIn": 900
  }
}
```

Acompanhado de um novo `Set-Cookie` com o token rotacionado.

**`POST /auth/logout` (`204 No Content`)** — sem corpo, com `Set-Cookie: refresh_token=; Max-Age=0; Path=/auth`.

**`POST /auth/forgot-password` (`202 Accepted`)**

```json
{
  "data": {
    "message": "Se o email estiver cadastrado, você receberá um link de recuperação."
  }
}
```

> A mensagem é deliberadamente condicional (`se ... estiver`). Ela é a mesma para email existente e inexistente, e a redação precisa ser verdadeira nos dois casos — uma confirmação afirmativa ("enviamos um link") seria mentira num deles e entregaria a informação que o `202` genérico existe para esconder.

**`POST /auth/reset-password` (`204 No Content`)** — sem corpo. O membro é levado ao login; nenhuma sessão é criada aqui, já que todas acabaram de ser revogadas.

**`GET /auth/me` (`200 OK`)**

```json
{
  "data": {
    "id": "uuid",
    "email": "string",
    "name": "string",
    "role": "avaliador",
    "profile": {
      "memberId": "uuid",
      "fullName": "string",
      "phone": "string",
      "course": "string",
      "semester": 4,
      "manager": false,
      "syncedAt": "timestamp"
    }
  }
}
```

> O refresh token **nunca** aparece no corpo de nenhuma resposta. Se ele estiver no JSON, ele está ao alcance de qualquer script na página, e o `HttpOnly` do cookie perde a razão de existir.

### 8.4 Responses — Erros

Segue o envelope já padronizado em `shared/src/schemas/error.schema.ts` (`{ error: { code, message, field? } }`). Códigos previstos, na convenção de `CandidateErrorCode`:

| `code`                          | Cenário | HTTP  |
| ------------------------------- | ------- | ----- |
| `EMAIL_ALREADY_REGISTERED`      | E1, E6  | 409   |
| `NOT_A_MEMBER`                  | E2      | 403   |
| `MEMBER_NOT_ACTIVE`             | E3      | 403   |
| `MEMBER_DIRECTORY_UNAVAILABLE`  | E5      | 503   |
| `INVALID_CREDENTIALS`           | E7      | 401   |
| `MISSING_REFRESH_TOKEN`         | E8      | 401   |
| `INVALID_REFRESH_TOKEN`         | E9, E10 | 401   |
| `TOKEN_EXPIRED`                 | E11 (expirado) | 401 |
| `INVALID_TOKEN`                 | E11 (malformado/assinatura inválida) | 401 |
| `ACCOUNT_DEACTIVATED`           | E12     | 401   |
| `INVALID_RESET_TOKEN`           | E14     | 400   |
| `WEAK_PASSWORD`                 | E15 (e E4, no cadastro) | 400 |

> E10 (reuso) devolve o mesmo `code` de E9 de propósito: para o cliente legítimo os dois são "sua sessão acabou, faça login". A diferença — revogar a família inteira — é interna, e sinalizá-la ao cliente só entregaria informação a quem estivesse testando tokens roubados. A distinção deve aparecer no log, não na resposta.

---

## 9. Requisitos Técnicos Definidos

| Requisito                        | Decisão                                                                                                                                                                                | Justificativa                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biblioteca de JWT                | `hono/jwt` (middleware de verificação) + `jose` para assinar. **Passport.js descartado**                                                                                                | Passport depende do par `req`/`res` do Node e de `express-session`, que não existem num Worker; `jose` já é dependência do `api/` e roda sobre WebCrypto                                                                    |
| Algoritmo do access token        | HS256, secret em `JWT_SECRET` (`wrangler secret put`, nunca em `vars`)                                                                                                                 | Emissor e verificador são o mesmo Worker — assimetria (RS256/EdDSA) só traria gestão de chave sem nenhum terceiro para verificar                                                                                            |
| TTL do access token              | 15 minutos                                                                                                                                                                             | Access token é stateless: não há como revogá-lo antes de expirar. 15 min é a janela de exposição aceita em troca de não consultar o banco a cada requisição                                                                 |
| Formato do refresh token         | Opaco: 32 bytes de `crypto.getRandomValues`, base64url. **Não é JWT**                                                                                                                   | Ele já é validado contra o banco a cada uso; assiná-lo não acrescentaria nada e só exporia claims desnecessariamente                                                                                                        |
| Armazenamento do refresh token   | Apenas o SHA-256 em `sessions.refresh_token_hash`                                                                                                                                      | Um dump do D1 não pode virar acesso às contas. Não precisa de KDF caro (o token tem 256 bits de entropia — não é adivinhável como uma senha)                                                                                |
| TTL do refresh token             | 7 dias, renovado a cada rotação                                                                                                                                                        | Cobre a semana de trabalho sem forçar login diário; uma sessão parada por 7 dias morre sozinha                                                                                                                              |
| Rotação e reuso                  | Cada `/auth/refresh` revoga o token usado e emite outro na mesma `family_id`. Apresentar um token já revogado revoga a família inteira                                                  | É o que dá sentido a persistir sessão: sem rotação, um refresh token roubado vale 7 dias em silêncio; com detecção de reuso, o segundo uso derruba as duas partes e o dono percebe                                          |
| Transporte da sessão             | Access token no corpo da resposta → front guarda **em memória** → envia em `Authorization: Bearer`. Refresh token só em cookie `HttpOnly; Secure; SameSite=None; Path=/auth`            | Modelo híbrido escolhido: o refresh (longo) fica fora do alcance de XSS, e o access (curto) não fica em `localStorage`. `SameSite=None` é obrigatório porque front (Vercel) e API (Cloudflare) são sites diferentes          |
| CORS de `/auth/*`                | Middleware **próprio**, com `credentials: true` e origin explícita vinda de uma var (`FRONT_ORIGIN`), separado do `cors()` de `/candidate/*`                                            | O `cors()` atual reflete qualquer origin — comportamento correto para o fluxo público, e inaceitável junto com cookies: `credentials: true` com origin refletida entrega a sessão a qualquer site                            |
| Hash de senha                    | PBKDF2-SHA256 via WebCrypto, salt aleatório de 16 bytes por usuário, chave derivada de 32 bytes. Persistido como `pbkdf2-sha256$<iterations>$<salt_b64url>$<hash_b64url>`               | bcrypt/scrypt/argon2 não têm implementação nativa no runtime dos Workers (WASM seria a alternativa, com custo de bundle e cold start). O formato com parâmetros embutidos permite aumentar iterações depois sem migration     |
| Orçamento de CPU (plano Free)    | 10 ms de CPU por invocação. **I/O não conta** — as chamadas à Supabase, ao D1 e (futuramente) ao Resend podem levar segundos sem gastar o orçamento                                     | Define onde a otimização importa: o único trecho de CPU pura em todo o fluxo de auth é a derivação da senha. Assinar o JWT (um HMAC) e gerar UUID/token aleatório são desprezíveis                                          |
| Iterações do PBKDF2              | **Calibrar medindo**, com teto de ~5 ms de CPU só para a derivação (metade do orçamento, deixando folga para parsing, D1 e serialização). Expectativa realista: faixa de 10.000–50.000  | OWASP recomenda 600.000 para PBKDF2-SHA256 — inatingível com 10 ms. O número precisa sair de medição no Worker real (`wrangler dev` não reflete o teto de produção), não de escolha no papel. Um `register` que estoure o limite falha com `Error 1102`, e falharia **sempre**, não sob carga |
| Robustez do hash                 | **Risco aceito** enquanto o projeto estiver no plano Free. Mitigações que não custam CPU: salt único por usuário, hash nunca exposto em resposta ou log, e rate limiting no edge          | Com iterações ~40× abaixo do recomendado, o custo de um ataque offline cai na mesma proporção. Não há como comprar essa robustez de volta dentro de 10 ms de CPU — o que resta é reduzir a chance de o hash vazar e o custo de subir o parâmetro depois |
| Reforço do hash (upgrade path)   | O `iterations` fica embutido no hash (`pbkdf2-sha256$<iterations>$…`). Ao logar com sucesso, se o hash armazenado usar menos iterações que o parâmetro atual, **re-derivar e regravar**  | Torna o aumento de custo uma mudança de constante, sem migration e sem forçar ninguém a trocar de senha: no dia em que o projeto for para o plano pago, as contas se fortalecem sozinhas no próximo login                    |
| Comparação de hash               | Comparação em tempo constante                                                                                                                                                          | Comparação com short-circuit vaza o prefixo correto do hash byte a byte                                                                                                                                                     |
| Consulta ao diretório (Supabase) | `fetch` direto no PostgREST: `GET {SUPABASE_URL}/rest/v1/members?email=ilike.{email}&select={TEC_MEMBER_SELECT}&limit=1`, headers `apikey` e `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`, com `AbortSignal.timeout(3000)` | Uma query filtrada por email não justifica os ~50 kb e a camada de abstração do `@supabase/supabase-js` num runtime onde bundle size é cold start. O timeout impede que uma Supabase lenta segure a requisição do membro    |
| Nomes de coluna da tec           | Colunas explícitas no `?select=`, com alias `nosso:deles` para as três que divergem (`full_name:name`, `birth_date:birth_data`, `updated_at:update_at`)                                                                                                | Duas delas são typo na origem, e é banco de outro time — a aplicação não pode depender de um rename lá para funcionar. Traduzir no boundary mantém os nomes bons em `member_profiles`, no service e no `/auth/me`. Pedir coluna inexistente devolve **400**, que vira E5 (503) para todo membro: a falha não é do membro, e nenhuma tentativa dele resolve |
| Filtro de email na Supabase      | `ilike` em vez de `eq`                                                                                                                                                                 | `TEXT` em Postgres é case-sensitive: se a tec gravou `Fulano@…` e o membro digita `fulano@…`, `eq` não acha e um membro legítimo é barrado como "não é membro"                                                              |
| Segredo da Supabase              | `SUPABASE_SERVICE_ROLE_KEY` como secret do Worker; `SUPABASE_URL` como var                                                                                                             | A `service_role` ignora RLS e dá acesso total ao banco da tec. Ela só pode existir no backend, e nunca em `wrangler.jsonc`                                                                                                  |
| Momento da validação             | Somente no cadastro                                                                                                                                                                    | Mantém a Supabase fora do caminho crítico do login: uma indisponibilidade dela impede cadastros novos, mas não derruba quem já tem conta. Desligamento de membro vira desativação manual (`users.deactivated_at`)             |
| Falha do diretório               | Fail-closed: `503`, sem escrita no D1                                                                                                                                                  | O oposto (criar a conta e validar depois) transformaria uma indisponibilidade momentânea em conta indevida permanente                                                                                                       |
| Papel do usuário                 | **Todo cadastro entra como `avaliador`.** `admin` existe na tabela `roles` e só é atribuído por `UPDATE` manual no D1. O `manager` da tec é gravado em `member_profiles`, mas **não** influencia o papel  | Papel na aplicação e cargo na empresa são coisas diferentes: quem administra o processo seletivo não é necessariamente quem é diretor. Manter os dois desacoplados evita que uma mudança na estrutura da tec conceda permissão aqui sem ninguém decidir — e faz o primeiro admin nascer do mesmo jeito que todos os outros |
| Elegibilidade do membro          | Lista `ELIGIBLE_MEMBER_STATUSES` em `shared`, hoje `["active"]`. Qualquer status fora dela (incluindo valor desconhecido) reprova (E3)                                                   | Começar pelo conjunto mais restrito é o único caminho reversível: liberar depois quem foi barrado é uma linha, enquanto revogar acesso já concedido exige achar e desativar contas. A lista existe para que essa liberação seja barata quando a política for decidida (seção 10, pergunta 3) |
| Recuperação de senha             | Token opaco de 32 bytes, hash SHA-256 em `password_reset_tokens`, validade de 30 min, **uso único**. Ao redefinir, todas as sessões do usuário são revogadas no mesmo batch              | Mesma disciplina dos refresh tokens: um dump do D1 não pode virar acesso. A validade curta limita a janela de um link vazado na caixa de entrada, e revogar as sessões é o que faz a redefinição efetivamente expulsar quem estava dentro |
| Envio de email                   | Resend via `fetch`, disparado com `c.executionCtx.waitUntil()`. **Sem fila** — Cloudflare Queues exige plano pago                                                                        | I/O não consome o orçamento de CPU, então o custo do envio é irrelevante; o `waitUntil` existe para a latência percebida. O preço de não ter fila é não ter retry nem dead-letter: um Resend fora do ar perde aquele email e o membro pede de novo. Se virar problema, o padrão free-plan é uma tabela outbox drenada pelo Cron Trigger que já existe |
| Resposta de `forgot-password`    | `202 Accepted` idêntico para email existente e inexistente                                                                                                                             | Sem isso a rota vira um verificador de contas — e diferente do `register`, aqui não há nenhuma contrapartida de usabilidade, já que o membro digitou o próprio email                                                          |
| Atomicidade do cadastro          | `users` + `member_profiles` + `sessions` num único `D1Database.batch`                                                                                                                  | Mesmo requisito do FEAT-0001: nenhum dos estados parciais ("usuário sem perfil", "usuário sem sessão após 201") tem representação válida no domínio                                                                          |
| Checagem prévia de email         | Consulta ao D1 antes do insert, **não** é a barreira de integridade                                                                                                                    | Dá a mensagem específica no caso comum; a constraint `unique` de `users.email` é quem garante a invariante, inclusive no caso concorrente (E6)                                                                              |
| Rate limiting                    | Regra de Rate Limiting da Cloudflare (WAF) no edge, cobrindo `/auth/login` e `/auth/register` **numa única regra** (`POST` + `starts_with(uri.path, "/auth/")`)                          | Contar tentativas dentro do Worker exigiria KV ou Durable Object para fazer pior o que a plataforma já faz **antes** da requisição chegar — e antes de gastar CPU com PBKDF2, que é o ponto. O plano Free dá apenas uma regra de rate limiting, daí o match único em vez de uma regra por endpoint (confirmar a cota na conta) |
| Limpeza de sessões e tokens      | Prune de `sessions` (expiradas, ou revogadas há mais de 30 dias) e de `password_reset_tokens` (expirados ou usados) no Cron Trigger que o Worker já tem (FEAT-0002)                      | A rotação cria uma linha por refresh: uma sessão ativa por 7 dias gera centenas de linhas revogadas. Sem prune, as tabelas crescem sem teto contra os limites de linha do D1 no plano Free. O cron já existe e roda de hora em hora — não é infra nova |
| Modo de manutenção               | O middleware de `MAINTENANCE_MODE` deve passar a cobrir `/auth/*` também                                                                                                               | Ele existe para fechar a janela de escrita durante migrations (`CONTEXT.md`); uma migration que toque `users`/`sessions` precisa do mesmo bloqueio que `/candidate/*` já tem                                                 |
| Contratos                        | `shared/src/schemas/auth.schema.ts` (payloads, responses, `AuthErrorCode`) e `shared/src/schemas/member.schema.ts` (`TecMemberSchema`, `MemberStatus`); linhas novas em `database.schema.ts`; ambos exportados por `shared/src/index.ts` | Regra de ouro do `AGENTS.md`: nenhum tipo de request/response duplicado em `api/` ou `front/`. `TecMemberSchema` também serve para **validar** a resposta da Supabase, que é entrada não confiável                        |

---

## 10. Perguntas Esclarecidas / Em Aberto

| #   | Pergunta                                                                                       | Resposta                                                                                                                                                                                                                                          | Decidido em |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | O `status` da tabela `members` é confiável?                                                    | **Não.** Confirmado que o CHECK nunca foi criado na Supabase — a coluna é `TEXT` livre. A API é a única barreira, e trata qualquer valor ≠ `"active"` como não elegível (fail-closed). Nada a corrigir na origem: a validação fica do nosso lado, onde ela é obrigatória de qualquer forma | 2026-08-06  |
| 2   | Quantas iterações de PBKDF2 cabem no orçamento de CPU?                                          | **Plano Free confirmado → 10 ms de CPU por invocação.** As iterações ficam na faixa de 10k–50k (a medir em produção), bem abaixo das 600k recomendadas. A perda de robustez é **risco aceito** enquanto o plano for Free; o `iterations` embutido no hash mantém aberto o caminho de subir o custo sem migration. Ver seção 13 | 2026-08-06  |
| 3   | Quem pode se cadastrar, por status?                                                            | **Só `active`, nesta versão.** `on_leave` e `alumni` ficam de fora até existir uma política para eles. A direção provável não é liberá-los na lista, e sim **um fluxo de liberação por admin** — quem se afastou ou saiu passa por aprovação em vez de entrar direto. Fica como feature futura, não como pendência bloqueante | 2026-08-06  |
| 4   | `manager` da tec deve virar `admin` na aplicação?                                              | **Não.** Todo cadastro entra como `avaliador`; `admin` só por promoção manual. Papel na aplicação e cargo na empresa ficam desacoplados                                                                                                            | 2026-08-06  |
| 5   | Como nasce o primeiro `admin`?                                                                 | **`UPDATE` manual no D1**, mesmo caminho de correção de inscrição (FEAT-0001, seção 13). Deixou de ser um caso especial: como ninguém entra como admin, o primeiro é promovido igual a todos os outros                                              | 2026-08-06  |
| 13  | `alumni` (ex-membro) também deveria poder se cadastrar?                                        | **Não por ora**, mesma resposta da pergunta 3. A ambiguidade que motivou esta pergunta (`on_leave` = afastado vs. `alumni` = ex-membro) deixou de bloquear: nenhum dos dois entra nesta versão, e a decisão sobre os dois acontece junto, quando o fluxo de liberação por admin for especificado | 2026-08-06  |
| 6   | O cadastro deve ter um passo de "checar email" antes de pedir a senha?                          | **Não.** O design (FEAT-0003-UI) resolve o cadastro num formulário único — email, senha e confirmação juntos. Nenhum endpoint de pré-checagem é criado, o que também evita expor um verificador de pertencimento à empresa sem credencial nenhuma | 2026-08-06  |
| 7   | Cadastro já devolve sessão (auto-login)?                                                        | **Sim** (seção 4.1). Revisável em FEAT-0003-UI se a tela de cadastro precisar de um passo intermediário                                                                                                                                             | 2026-08-05  |
| 8   | Como um membro recupera a senha esquecida?                                                      | **`/auth/forgot-password` + `/auth/reset-password`, dentro desta spec (v1.2).** O Resend volta ao projeto, **sem fila** — Queues exige plano pago, e o envio sai do caminho crítico com `c.executionCtx.waitUntil()`. FEAT-0004 deixa de existir como spec separada. Ver seção 13 | 2026-08-06  |
| 14  | Trocar a senha estando logado?                                                                  | **Fora de escopo, por decisão.** O único caminho de troca passa a ser o "esqueci minha senha", inclusive para quem lembra da senha atual. Ver a consequência registrada na seção 13                                                                | 2026-08-06  |
| 9   | O que acontece quando os dados do membro mudam na tec depois do cadastro?                       | **Nada, por ora.** O `member_profiles` é snapshot com `synced_at`. Resincronização é feature futura — o `member_id` guardado é o que a torna possível                                                                                              | 2026-08-05  |
| 10  | `JWT_SECRET` precisa de rotação?                                                                | **Em aberto.** Trocar o secret invalida todos os access tokens em circulação (no máximo 15 min de impacto) mas **não** os refresh tokens, então o efeito prático para o usuário é pequeno. Sem procedimento definido nesta versão                    | Pendente    |
| 11  | Qual o mínimo de caracteres da senha?                                                           | **8**, o mesmo que `UserSchema` já usa — sem divergência a reconciliar. `PasswordSchema` (`auth.schema.ts`) passa a ser a fonte única da regra e `UserSchema.password` deve reusá-lo, para que uma futura mudança tenha um só lugar para acontecer | 2026-08-06  |
| 12  | E se a tec criar um `status` novo (`suspended`, etc.)?                                          | **Acrescentar o literal em `MemberStatusSchema` (`shared`).** Enquanto isso não acontece, o valor desconhecido reprova a elegibilidade (E3) e ninguém entra por engano — a atualização do enum é uma correção de precisão, não um conserto de indisponibilidade | 2026-08-06  |

---

## 11. Dependências Externas

- **Banco da tec na Supabase (PostgREST)** — consultado **apenas** em `POST /auth/register`.
  - Falha (timeout de 3s, erro de rede, resposta não-2xx) ⇒ `503` e nenhuma escrita. Cadastro fica indisponível; login, refresh, logout e `/auth/me` seguem funcionando normalmente.
  - Acesso somente leitura, uma tabela (`members`), filtrada por email. A aplicação nunca escreve na Supabase.
- **Resend** — usado **apenas** em `POST /auth/forgot-password`, fora do caminho crítico (`waitUntil`).
  - Falha ⇒ o membro recebe `202` normalmente e o email não chega. Não há retry: ele precisa pedir de novo.
  - Reintroduz no projeto o `RESEND_API_KEY` (secret) e um remetente verificado. Segundo o `CONTEXT.md`, o secret **pode ainda existir** nos Workers `api` e `api-staging` — foi deixado para trás na v3.0 sem `wrangler secret delete`. Conferir antes de recriar.
  - Nenhum outro fluxo depende dele. Cadastro, login, refresh, logout e `/auth/me` seguem sem provedor de email.
- **Nenhuma outra.** Login e sessão dependem só do D1 e do próprio Worker.

**Limites do plano Free relevantes para esta feature:**

| Recurso                       | Limite (Free)                          | Impacto aqui                                                                                                       |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| CPU por invocação             | 10 ms                                  | Restringe as iterações do PBKDF2 (seções 9 e 13). É o limite que molda o desenho                                    |
| Escrita no D1                 | 100.000 linhas/dia                      | Cada refresh grava uma linha em `sessions`. Com dezenas de membros é irrelevante, mas exige o prune do cron          |
| Leitura no D1                 | 5.000.000 linhas/dia                    | Folgado — `/auth/me` e o login leem poucas linhas indexadas                                                         |
| Regras de rate limiting (WAF) | 1                                       | Por isso a regra única cobrindo `/auth/*` em vez de uma por endpoint                                                |
| Cloudflare Queues             | **Indisponível**                        | Motivo do envio de email usar `waitUntil` (e, se preciso, outbox no D1) em vez de fila                              |
| Cron Triggers                 | Disponível                              | Já em uso pelo FEAT-0002; absorve o prune de `sessions` e de `password_reset_tokens` sem infra nova                 |

---

## 12. Métricas de Sucesso

> Sugestões para discutir com o time:
>
> - Taxa de cadastros bloqueados por E2 (`NOT_A_MEMBER`) — se for alta, o banco da tec está desatualizado ou os membros estão usando um email diferente do cadastrado lá
> - Taxa de E5 (`MEMBER_DIRECTORY_UNAVAILABLE`) — mede a confiabilidade da Supabase como dependência do cadastro
> - Falhas de login por membro (proxy de "esqueci a senha", que hoje não tem fluxo de autoatendimento)
> - Ocorrências de reuso de refresh token (E10) — qualquer número diferente de zero merece investigação
> - Tempo de CPU do `POST /auth/register` e `/auth/login` — é onde o PBKDF2 aparece, e é o que decide a pergunta 2 da seção 10

---

## 13. Notas e Observações

- **O cadastro é, por construção, um verificador de pertencimento à empresa.** Distinguir E2 (`NOT_A_MEMBER`) de E3 (`MEMBER_NOT_ACTIVE`) permite a qualquer pessoa descobrir se um email é de membro ativo da CIMATEC jr, sem nenhuma credencial. A alternativa (uma mensagem genérica) deixaria o membro legítimo sem saber se errou o email ou se precisa falar com a diretoria — e é justamente esse o caso comum. A distinção fica, e o rate limit no edge é o que impede a varredura em escala. É uma escolha consciente, não um descuido.
- **O "esqueci minha senha" é o único caminho de troca de credencial.** Como a troca de senha pelo usuário logado ficou fora de escopo, um membro que apenas *queira* trocar a senha — sem ter esquecido — também passa pelo email. Duas consequências que valem estar escritas: (a) trocar de senha exige receber um email, então quem tiver problema de entrega fica sem nenhuma forma de trocar; (b) o `reset-password` é a única rota que revoga todas as sessões de uma conta, o que o torna também o botão de pânico de quem desconfia que alguém entrou. Adicionar `POST /auth/change-password` depois é barato (uma rota, sem tabela nova, sem dependência externa) e resolve os dois pontos — fica registrado como o primeiro candidato a entrar se isso incomodar.
- **O email volta a ser dependência do projeto, mas num lugar diferente do que era.** O provedor saiu na FEAT-0001 v3.0 porque o OTC colocava o Resend **entre o candidato e a inscrição gravada** — se o email não chegasse, a inscrição se perdia em silêncio. Aqui o email está no caminho da *recuperação* de uma conta que já existe, de um membro identificado, que pode pedir de novo ou procurar quem administra. É a mesma tecnologia com um modo de falha muito menos grave. Vale ter em mente, ainda assim, que o problema documentado na v3.0 era entrega em **domínio institucional** — exatamente o tipo de email que os membros usam. Se os links de recuperação não chegarem, o motivo provavelmente já é conhecido.
- **Sem fila, não há retry nem dead-letter.** Um Resend fora do ar no instante do envio perde aquele email, e o membro precisa pedir de novo. É aceitável para recuperação de senha; não seria para email transacional de que o negócio dependesse. Se virar problema, o caminho free-plan é uma tabela outbox no D1 drenada pelo Cron Trigger que já roda de hora em hora — não Cloudflare Queues, que exige plano pago.
- **O `waitUntil` é o que torna o email compatível com o plano Free, não a fila.** O teto de 10 ms é de **CPU**, e uma chamada HTTP ao Resend é I/O — ela não consome o orçamento nem que demore dois segundos. O que o `waitUntil` resolve é outra coisa: manter a latência percebida pelo membro independente do provedor. Os dois problemas são distintos e é fácil confundi-los ao dimensionar isso.
- **`member_profiles` envelhece.** A validação acontece uma vez, no cadastro. Um membro que sai da empresa continua com conta funcionando até alguém preencher `users.deactivated_at`. Foi a escolha deliberada (manter a Supabase fora do login), e o preço dela é um passo operacional manual no desligamento. Se isso virar problema, o caminho de menor custo é uma revalidação periódica no Cron Trigger que o Worker já tem (FEAT-0002), não mover a checagem para o login.
- **O `cors()` atual não pode ser reaproveitado.** `app.use("/candidate/*", cors())` reflete a origin da requisição, o que é correto para um fluxo público sem credenciais (está comentado assim em `api/src/index.ts`). Aplicar o mesmo em `/auth/*` com `credentials: true` significaria entregar cookie de sessão para qualquer origin que peça. `/auth/*` precisa do seu próprio middleware, com allowlist explícita.
- **O cookie é cross-site.** Front na Vercel e API na Cloudflare são domínios diferentes, então `SameSite=Lax` (o default) simplesmente não envia o cookie no `/auth/refresh`. `SameSite=None; Secure` é obrigatório, e vale verificar se o navegador-alvo exige `Partitioned` (CHIPS) — do contrário o refresh vai falhar em produção depois de funcionar perfeitamente em `localhost`, onde tudo é same-site.
- **A verificação da senha é o único ponto caro do sistema — e no plano Free ela vive perto do teto.** Todo o resto da API é I/O, que não consome CPU time; o PBKDF2 é CPU pura, roda em `register` e em `login`, e precisa caber em 10 ms junto com todo o resto da requisição. Duas consequências práticas: (a) se o rate limit no edge não existir, cada tentativa de login inválida custa o mesmo CPU de uma válida, o que torna o endpoint um alvo barato de esgotamento mesmo sem ninguém adivinhar senha nenhuma; (b) estourar o limite não é um problema de carga — é determinístico. Um número de iterações alto demais faz **todo** login falhar com `Error 1102`, sempre, inclusive o primeiro teste. Calibrar medindo em produção (`wrangler dev` não aplica o teto) é parte da implementação, não uma otimização posterior.
- **Risco aceito: o hash de senha é mais fraco do que o recomendado.** Com iterações ~40× abaixo do que o OWASP indica e mínimo de 8 caracteres, um vazamento do D1 deixa os hashes bem mais baratos de atacar offline do que o padrão da indústria. A decisão foi tomada de olho aberto: o teto de 10 ms de CPU do plano Free não permite pagar o custo, e o que está protegido aqui são dados de inscrição de candidatos — não dinheiro, não dados de saúde. Fica registrado para que a escolha não seja redescoberta como surpresa mais tarde. Uma denylist de senhas comuns foi considerada e **descartada** — o que sobra como mitigação é o rate limit no edge, o salt por usuário e o caminho de reforço abaixo. **Se essa linha for revisitada, o caminho já está pronto:** migrar para o plano pago, subir `iterations`, e as contas se fortalecem sozinhas no próximo login (seção 9, "Reforço do hash") — sem migration e sem ninguém trocar de senha. Os dois gatilhos naturais para isso são a aplicação passar a guardar algo mais sensível, ou o time crescer a ponto de o vazamento de uma conta ter alcance maior.
- **Só membro ativo entra, e isso é o começo restrito de propósito.** `on_leave` (afastado) e `alumni` (ex-membro) chegaram a ser considerados e ficaram de fora: a empresa realmente convoca essas pessoas para ajudar no processo seletivo, mas não existe ainda uma política de quem exatamente pode voltar e com qual permissão. A ordem importa — liberar depois quem foi barrado é uma linha em `ELIGIBLE_MEMBER_STATUSES`, enquanto tirar acesso de quem já criou conta exige achar as contas e desativá-las uma a uma. Na dúvida, o conjunto menor é o reversível. **O que se perde enquanto isso:** um ex-membro convocado para avaliar não consegue criar conta e recebe E3, e alguém vai precisar resolver isso manualmente no dia. A direção provável de solução não é engordar a lista, e sim um fluxo de liberação por admin — o que também dá a chance de decidir se essas pessoas entram com o mesmo papel dos membros ativos.
- **Esta spec não define quem pode o quê.** Ela entrega `role` no token e no `/auth/me`, e para por aí. A primeira spec que precisar de autorização (avaliação, provavelmente) é quem vai definir o middleware de papel — e vai encontrar o dado já pronto.
