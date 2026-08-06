# SPEC — Cadastro e Autenticação de Membro (Interface / Front-end)

ID: FEAT-0003-UI
Módulo: Acesso à aplicação — Camada de UI
Versão: 1.0
Data: 2026-08-06
Status: APPROVED
Depende de: FEAT-0003 (backend) v1.2
Design: Stitch — projeto "Design System Integration" (ID `15618719394726153851`)

> **Contexto:** esta é a primeira parte do front-end que tem **estado de sessão**. Tudo que existia até aqui (a inscrição pública do FEAT-0001-UI) era anônimo, sem cookie, sem token e sem nada para proteger. A partir daqui o navegador passa a carregar credencial entre requisições, e a maior parte desta spec trata disso — não das telas.
>
> **Decisão de fluxo registrada:** a recuperação de senha usa **link com token**, não código de 6 dígitos. A tela "Verificação de Código (Mobile)" (`a005abf8591047f392a448a8d429951e`) do projeto Stitch **não faz parte desta feature** e não deve ser implementada. Ver seção 12.

---

## 1. Objetivo

Definir o contrato entre as telas de autenticação (projeto Stitch) e a API descrita em FEAT-0003: quais dados cada tela captura, para qual endpoint envia, o que faz com a resposta, e como reage a cada erro.

Define também **onde a sessão vive no navegador** e como ela sobrevive (ou não) a um reload — a parte que nenhuma tela mostra e que decide se a aplicação funciona.

Esta spec **não** descreve cores, tipografia, espaçamento ou copy final: isso sai do projeto Stitch e do design system. As exceções são a copy dos estados de erro (seção 7), que não existe no Stitch e carrega regra de negócio, e os pontos onde o design conflita com o contrato (seção 12).

---

## 2. Atores

- **Ator primário:** membro da CIMATEC jr, em desktop ou mobile

**Restrição:** o candidato do FEAT-0001 nunca vê estas telas. Os dois fluxos não se cruzam e não compartilham layout, rota ou estado.

---

## 3. Escopo — Telas

| # | Tela | Rota sugerida | Stitch (desktop) | Stitch (mobile) |
| - | ---- | ------------- | ---------------- | --------------- |
| 1 | Acessar Conta (login) | `/login` | `45d596fe0cb049909ff25293848432a8` | `f57a1285d25a4c24856a7b12559b8a8a` |
| 2 | Criar Conta de Avaliador | `/cadastro` | `17da7de0a4954bf489a3ab49892bcbe5` | `e4b5a25aefb542c488cdc0db7f9623d5` |
| 3 | Recuperar Acesso | `/recuperar-senha` | `7a80d256b67a44f4adb5c6758511a9ff` | `52e73f3d7072417892c5625cca71c99b` |
| 4 | Definir Nova Senha | `/redefinir-senha?token=…` | **não existe** | **não existe** |

> **Não há tela de "verifique seu email".** Depois do envio, a tela de recuperação exibe uma **mensagem inline** no lugar do formulário — não há rota nem tela nova para isso. O retorno precisa existir de alguma forma, senão o botão parece não ter feito nada, mas uma tela dedicada seria peso sem função.
>
> **A tela 4 precisa ser desenhada, e é bloqueante para o fluxo de recuperação.** O Stitch cobre pedir a recuperação, mas não o destino do link: sem ela o membro recebe o email e não tem para onde ir. Não bloqueia login nem cadastro.
>
> **A tela "Verificação de Código" está fora.** Ver seção 12.

Todas as telas de auth são **Client Components**. Elas dependem de formulário controlado e do estado de sessão, que vive na memória do navegador — um Server Component não tem como lê-lo. Isso contraria o padrão do `front/AGENTS.md` (preferir Server Components) por um motivo estrutural, não por conveniência.

---

## 4. Fluxo Principal (telas em sequência)

### 4.1 Cadastro — `/cadastro`

1. Membro informa email institucional, senha e confirmação de senha.
2. Validação client-side (seção 6). A confirmação **nunca é enviada** — existe só para pegar erro de digitação.
3. `POST /auth/register` com `{ email, password }`.
4. Sucesso (`201`): a resposta já traz `accessToken` e `user`, e o cookie de refresh é setado pelo backend. **O membro entra direto** — não passa pelo login (FEAT-0003, seção 4.1).
5. Guarda a sessão (seção 8) e navega para a área logada.

### 4.2 Login — `/login`

1. Membro informa email e senha.
2. `POST /auth/login`.
3. Sucesso (`200`): mesma resposta do cadastro. Guarda a sessão e navega para a área logada.

### 4.3 Pedido de recuperação — `/recuperar-senha`

1. Membro informa o email.
2. `POST /auth/forgot-password`.
3. **Sempre** sucesso (`202`): o formulário dá lugar a uma **mensagem inline** na mesma tela, exibindo o texto que veio em `data.message`, com um caminho de volta para `/login`.

> A UI **não pode** afirmar que o email foi enviado. O backend responde igual para email existente e inexistente (FEAT-0003, seção 4.6), e a copy precisa continuar verdadeira nos dois casos — "se o email estiver cadastrado, você receberá…". Uma tela que diz "enviamos um link para você" transforma o `202` genérico em confirmação de que a conta existe, anulando o motivo dele existir.

### 4.4 Definir nova senha — `/redefinir-senha?token=…`

1. A tela lê o `token` da query string. Ausente ⇒ estado de erro direto, sem chamar a API.
2. Membro informa a nova senha + confirmação.
3. `POST /auth/reset-password` com `{ token, password }`.
4. Sucesso (`204`): navega para `/login` com um aviso de que a senha foi alterada.

> **Não autentica.** O backend revoga todas as sessões no reset (FEAT-0003, seção 4.7), então não há sessão para aproveitar — o membro entra de novo, agora com a senha nova. É o oposto do cadastro (4.1), e a diferença é proposital: no cadastro ele acabou de definir a senha num contexto que já era dele; aqui ele está retomando uma conta que pode ter sido comprometida.
>
> **O token não deve sobrar na barra de endereços** depois de usado. Substituir a URL (`history.replaceState`) ao montar a tela evita que ele fique no histórico do navegador e em eventual compartilhamento de tela.

### 4.5 Reidratação de sessão (sem tela)

Roda no boot da aplicação, antes de qualquer rota protegida renderizar:

1. `POST /auth/refresh` (o cookie viaja sozinho).
2. `200` ⇒ guarda o novo access token e chama `GET /auth/me` para popular os dados do usuário.
3. `401` ⇒ não há sessão. Segue como visitante.

> **Por que isso existe:** o access token vive em memória (seção 8) e morre em todo reload. Sem esta etapa, um F5 na área logada jogaria o membro para o login mesmo com a sessão válida. O cookie de refresh é o que sobrevive, e é ele quem reconstrói a sessão.

---

## 5. Estados de UI por tela

| Tela | Estados obrigatórios |
| ---- | -------------------- |
| Login | idle → enviando (botão desabilitado + indicador) → erro (seção 7) / sucesso (navega) |
| Cadastro | idle → enviando → erro (seção 7) / sucesso (navega) |
| Recuperar Acesso | idle → enviando → **mensagem inline no lugar do formulário** (estado terminal; sem caso de erro visível) |
| Definir Nova Senha | verificando token na URL → idle → enviando → erro / sucesso (navega para login) |
| Boot da aplicação | **carregando sessão** → autenticado / visitante |

> **O estado "carregando sessão" não é opcional.** Sem ele, todo reload da área logada renderiza a tela de login por uma fração de segundo antes do `/auth/refresh` responder. Enquanto ele estiver pendente, rotas protegidas não decidem nada — nem renderizam, nem redirecionam.
>
> **Nenhum desses estados existe no Stitch.** Os mockups têm só o estado neutro: não há erro, loading, sucesso nem campo inválido. Precisam ser derivados do design system ou desenhados (seção 12).

---

## 6. Validação client-side (antes do POST)

Complementa, não substitui, a validação do backend. Todos os schemas vêm de `shared` — nenhuma regra reescrita no front (`front/AGENTS.md`, seção 1).

| Campo | Tela | Validação |
| ----- | ---- | --------- |
| `email` | Login, Cadastro, Recuperar | formato de email. **Não validar domínio** — ver nota abaixo |
| `password` | Login, Cadastro, Nova Senha | `PasswordSchema` de `shared` (min 8, máx 128) |
| `confirmPassword` | Cadastro, Nova Senha | `.refine()` comparando com `password`. Campo **só de cliente** — não existe no contrato da API e nunca é enviado |
| `token` | Nova Senha | presente e não vazio na query string |

> ⚠️ **Não bloquear por domínio de email.** O placeholder dos mockups (`seu.email@cimatecjr.com.br`) sugere restrição institucional, mas a elegibilidade é decidida pela tabela `members` na Supabase, não pelo domínio (FEAT-0003, seção 4.1). Um membro cadastrado na tec com email pessoal seria barrado pelo front antes da API sequer ser consultada — e o front não tem como saber que ele é membro. O placeholder fica como dica visual; a regra fica no backend.
>
> No login, a validação de senha é só de formato (campo não vazio). Aplicar `min(8)` no login barraria quem tem senha antiga mais curta caso a política mude no futuro — e a resposta correta para senha errada é `INVALID_CREDENTIALS` do backend, não um erro de formulário.

---

## 7. Tratamento de erros — Tela → Cenário do backend → Comportamento

Mapeamento dos códigos da FEAT-0003, seção 8.4.

### 7.1 Cadastro

| `code` | HTTP | Comportamento e intenção da copy |
| ------ | ---- | -------------------------------- |
| `EMAIL_ALREADY_REGISTERED` | 409 | "Já existe uma conta com este email." + link direto para `/login`. É o erro mais provável de todos, e o membro está a um clique de resolver |
| `NOT_A_MEMBER` | 403 | Este email não consta no cadastro de membros da empresa. A copy precisa orientar a ação real — falar com quem administra o cadastro da tec — e **não** sugerir tentar de novo, porque tentar de novo não muda nada |
| `MEMBER_NOT_ACTIVE` | 403 | O membro existe, mas não está ativo. Copy separada de `NOT_A_MEMBER`: são situações diferentes com pessoas diferentes para procurar |
| `MEMBER_DIRECTORY_UNAVAILABLE` | 503 | **Transitório.** "Não foi possível verificar seu cadastro agora, tente novamente em alguns minutos." Manter o formulário preenchido e o botão ativo |
| `WEAK_PASSWORD` | 400 | Erro no campo `password`; deveria ter sido barrado na seção 6 |
| `MAINTENANCE_MODE` | 503 | Se o middleware de manutenção for estendido para `/auth/*` (FEAT-0003, seção 9), exibir a mensagem do backend como está |

> **A distinção 403 vs 503 é a que mais importa aqui.** Os dois falam "não deu para criar sua conta", mas um é definitivo e o outro passa sozinho. Colapsá-los num "erro ao cadastrar" genérico faz o membro elegível desistir achando que não pode entrar, e faz o não-elegível insistir para sempre.

### 7.2 Login

| `code` | HTTP | Comportamento |
| ------ | ---- | ------------- |
| `INVALID_CREDENTIALS` | 401 | Mensagem única, no nível do formulário e **não** no campo. O backend responde igual para email inexistente e senha errada (FEAT-0003, seção 4.2); apontar "email não encontrado" reintroduziria no front o oracle que o backend evita |
| `ACCOUNT_DEACTIVATED` | 401 | Conta desativada — copy própria, orientando procurar a diretoria |
| — | 429 | Rate limit do edge. Não vem no envelope da API (é resposta da Cloudflare, antes do Worker): tratar pelo status HTTP, com mensagem de "muitas tentativas, aguarde" |

### 7.3 Recuperar Acesso

Não há erro visível — o backend sempre responde `202` (FEAT-0003, seção 4.6). Um `429` ou falha de rede exibe mensagem genérica de "tente novamente"; qualquer outra coisa vai para o estado de confirmação.

### 7.4 Definir Nova Senha

| `code` | HTTP | Comportamento |
| ------ | ---- | ------------- |
| `INVALID_RESET_TOKEN` | 400 | Link inválido, expirado ou já usado — a UI não sabe qual, e o backend não diz. Copy única + CTA para pedir um novo link (`/recuperar-senha`) |
| `WEAK_PASSWORD` | 400 | Erro no campo `password` |

### 7.5 Erros de sessão (não aparecem numa tela específica)

| `code` | HTTP | Comportamento |
| ------ | ---- | ------------- |
| `TOKEN_EXPIRED` | 401 | **Invisível ao membro.** Dispara o refresh e repete a requisição (seção 8.3) |
| `INVALID_TOKEN`, `INVALID_REFRESH_TOKEN`, `MISSING_REFRESH_TOKEN` | 401 | Sessão encerrada: limpa o estado local e navega para `/login` com aviso |

**Erro de rede / timeout / 5xx genérico:** mensagem de "tente novamente", **sem** limpar o formulário. Nunca deslogar por erro de rede — indisponibilidade momentânea não é fim de sessão.

---

## 8. Sessão no navegador

Esta seção é o núcleo da spec. As decisões aqui vêm do modelo híbrido definido em FEAT-0003, seção 9.

### 8.1 Onde cada credencial vive

| Credencial | Onde | Quem gerencia |
| ---------- | ---- | ------------- |
| Access token (JWT, 15 min) | **Memória** — contexto React ou variável de módulo | O front |
| Refresh token (7 dias) | Cookie `HttpOnly`, `Path=/auth` | **O navegador.** O front nunca lê, escreve nem vê |
| Dados do usuário (`id`, `email`, `name`, `role`) | Memória, junto do access token | O front |

> ⚠️ **Nada disso pode ir para `localStorage` ou `sessionStorage`.** O modelo híbrido só faz sentido se o access token for inacessível a script persistente e o refresh token for inacessível a script qualquer. Guardar o access token em `localStorage` "para não perder no reload" desmonta a decisão inteira — e é desnecessário, porque a reidratação (seção 4.5) resolve o reload.

### 8.2 Todas as chamadas a `/auth/*` precisam de `credentials: "include"`

O cookie é cross-site: o front está na Vercel e a API na Cloudflare. Sem `credentials: "include"` no `fetch`, o navegador **não envia** o cookie, e `/auth/refresh` responde `401` mesmo com sessão válida. Vale para `login`, `register`, `refresh` e `logout`.

### 8.3 Renovação automática — e o cuidado que ela exige

Um wrapper de `fetch` centraliza a regra: ao receber `401` com `TOKEN_EXPIRED`, chamar `/auth/refresh` e repetir a requisição original **uma única vez**.

> 🔴 **O refresh precisa ser _single-flight_ (uma chamada por vez, compartilhada).** Este é o ponto de falha mais provável de toda a implementação.
>
> O backend **rotaciona** o refresh token a cada uso e trata a reapresentação de um token já usado como **reuso**, revogando a família inteira de sessões (FEAT-0003, seção 4.3). Se a tela dispara três requisições em paralelo e o access token expirou, as três recebem `401` e as três chamam `/auth/refresh` com o mesmo cookie. A primeira rotaciona; a segunda e a terceira chegam com um token já revogado — e o backend, corretamente, entende isso como token roubado e **desloga o membro de tudo**.
>
> O sintoma seria bizarro de diagnosticar: o membro é expulso da aplicação a cada 15 minutos, só quando a tela carrega várias coisas ao mesmo tempo. A correção é trivial se feita desde o início — guardar a promise do refresh em curso e fazer as demais requisições aguardarem a mesma promise, em vez de disparar a sua.

Se o `/auth/refresh` falhar, todas as requisições que estavam esperando falham juntas, o estado é limpo e a navegação vai para `/login`.

### 8.4 Proteção de rota é client-side — e é só UX

**O `middleware.ts` do Next não consegue proteger rota nesta arquitetura.** O cookie de refresh é setado pelo domínio da API (Cloudflare) com `Path=/auth`; ele simplesmente não é enviado para o domínio do front (Vercel). O middleware não tem como vê-lo, muito menos validá-lo — validar exigiria consultar o D1.

Portanto: o layout da área logada consulta o estado de sessão (seção 4.5) e redireciona para `/login` quando não há. Isso é **experiência do usuário, não segurança** — a barreira real é a API respondendo `401`, e nenhuma tela protegida deve exibir dado sensível que não tenha vindo de uma chamada autenticada.

### 8.5 Logout

`POST /auth/logout` (com `credentials: "include"`), depois limpar o estado em memória e navegar para `/login`. A rota é idempotente e sempre responde `204`, então **não** condicionar a limpeza local ao sucesso da chamada: se a rede falhar, o membro ainda precisa sair da aplicação.

---

## 9. Fora de Escopo

- **Verificação de posse do email no cadastro** — não existe e não deve ser adicionada. O membro não confirma link nem código para criar a conta: a checagem contra o banco da tec (Supabase) já é a barreira, e um email que está lá foi validado pela empresa. Registrado aqui porque é o tipo de passo que reaparece por hábito no meio de uma implementação de cadastro
- Área logada (dashboard, avaliação, gestão) — telas existem no Stitch, mas pertencem a outras specs
- Troca de senha pelo usuário logado (fora de escopo também no backend, FEAT-0003 seção 7)
- Tela de "sessões ativas" / logout remoto
- Autorização por papel na UI — esta spec expõe `role` no estado de sessão; quem esconde ou mostra o quê é decisão das specs de negócio
- Dark mode (o config do Stitch declara `darkMode: "class"`, mas nenhuma tela tem variante escura)
- Página de política de privacidade — esta spec só posiciona o link (seção 12)

---

## 10. Dados e Contratos

Tudo de `shared`, nada redeclarado no front (`front/AGENTS.md`, seção 1):

| Uso | Origem |
| --- | ------ |
| Formulário de cadastro | `RegisterMemberSchema` (`auth.schema.ts`) + `confirmPassword` local via `.refine()` |
| Formulário de login | `LoginSchema` |
| Formulário de recuperação | `ForgotPasswordSchema` |
| Formulário de nova senha | `ResetPasswordSchema` + `confirmPassword` local |
| Resposta de sessão | `AuthSessionResponseSchema` |
| Dados do usuário logado | `MeResponseSchema` |
| Códigos de erro | `AuthErrorCode` — usar o enum, **nunca** comparar string literal |
| Envelope de erro | `ErrorResponseSchema` (`error.schema.ts`) |

Formulários com `react-hook-form` + `@hookform/resolvers/zod`, consumindo os schemas direto de `shared`.

---

## 11. Critérios de Aceite

- [ ] Access token vive apenas em memória; nenhuma credencial em `localStorage` ou `sessionStorage`
- [ ] Toda chamada a `/auth/*` usa `credentials: "include"`
- [ ] Reload na área logada mantém a sessão (via `/auth/refresh` no boot), sem piscar a tela de login
- [ ] **O refresh é single-flight:** N requisições paralelas com token expirado disparam **uma** chamada a `/auth/refresh`
- [ ] Uma requisição só é repetida uma vez após refresh — sem laço infinito de 401
- [ ] Falha de rede não desloga o membro
- [ ] Cadastro bem-sucedido leva direto à área logada, sem passar pelo login
- [ ] Reset de senha bem-sucedido leva ao login, **sem** criar sessão
- [ ] `NOT_A_MEMBER`, `MEMBER_NOT_ACTIVE` e `MEMBER_DIRECTORY_UNAVAILABLE` têm mensagens distintas, e só a última sugere tentar de novo
- [ ] Login não revela se o email existe
- [ ] A tela de recuperação não afirma que o email foi enviado
- [ ] `confirmPassword` nunca é enviado à API
- [ ] Nenhuma validação de domínio de email no client
- [ ] Nenhum schema ou tipo de auth declarado fora de `shared`
- [ ] O token de reset não permanece na URL após o uso

---

## 12. Notas — divergências entre o design e o contrato

Levantadas na leitura do HTML e dos screenshots do projeto Stitch. Nenhuma é bloqueante para começar, mas todas viram decisão no meio do caminho se não forem resolvidas antes.

- **A tela "Verificação de Código (Mobile)" está fora desta feature.** Ela implica um fluxo de OTC de 6 dígitos ("Enviar Código" → 6 campos de 1 dígito → "Reenviar"), incompatível com o token em link definido no backend. Um código de 6 dígitos são 10⁶ combinações contra 2²⁵⁶ do token, e só seria seguro com limite de tentativas por código — coluna e regra que o backend não tem. **Decisão tomada:** fica o link. A tela não deve ser implementada, e o botão "Enviar Código" das telas de recuperação precisa virar algo como "Enviar link de recuperação".
- **Falta a tela de definição de nova senha** (seção 3) — bloqueante para o fluxo de recuperação funcionar. A confirmação do envio é mensagem inline, não tela, e não precisa de mockup próprio.
- **Faltam todos os estados que não sejam o neutro.** Erro, loading, sucesso e campo inválido não existem em nenhum mockup — e é onde vive a maior parte da regra desta feature (seção 7).
- **Reusar o design system que já existe — não portar a paleta do Stitch.** O `front/app/globals.css` já tem Tailwind v4 com tokens semânticos (`--primary: #c8181e`, `--background`, `--foreground`, `--destructive`, `--ring`…) e variante `.dark`, estabelecidos na FEAT-0001-UI. E `components/ui/` já tem `input`, `button`, `label`, `field`, `alert`, `spinner`, `checkbox`, `select`, `textarea`, `radio-group`. O `--primary` existente **é** o vermelho dos botões destas telas. As telas de auth devem consumir esses tokens e primitivos; o único valor realmente novo é o azul institucional do painel de branding (`#002B5C` no HTML do Stitch), que entra como token novo em vez de cor solta.
- **O HTML do Stitch é referência visual, não código para colar.** Ele veio em Tailwind v3 (`cdn.tailwindcss.com` + `tailwind.config = {...}`, proibido pelo `front/AGENTS.md`) e com uma paleta Material 3 (`on-secondary-fixed`, `surface-container-lowest`) que é um sistema diferente do que o projeto usa. Copiar as classes de lá cria um segundo design system dentro do mesmo app.
- **Fontes por `<link>` do Google Fonts.** Outfit e Inter devem entrar por `next/font`; Material Symbols precisa ser auto-hospedado ou substituído por uma biblioteca de ícones — um `<link>` para CDN de fonte custa render-blocking e uma dependência externa em cada carregamento.
- **Dois azuis institucionais competindo.** `#002B5C` aparece hardcoded (`bg-deep-blue`, e de novo inline na tela de recuperação) enquanto o token set define `on-secondary-fixed: #001b3e` para o mesmo papel. Escolher um antes de replicar em quatro telas.
- **A tela de recuperação tem identidade visual diferente das outras.** Login e Cadastro usam o mesmo painel esquerdo (logo em caixa translúcida, "Portal de Gestão Técnica"); a de recuperação usa padrão de pontos, "CIMATEC Jr." com ponto final e "Sistema Corporativo Restrito". No mobile a divergência é maior ainda. Consolidar.
- **"Termos de Serviço" sai; "Privacidade" fica.** Decisão tomada: a aplicação importa dado pessoal de terceiros (nome, telefone, data de nascimento, etnia) da base da tec, o que dá função real à política de privacidade. Termos de serviço para uso interno da própria empresa não acrescentam nada. O link precisa apontar para uma página que ainda não existe.
- **Placeholder com domínio errado.** O mockup desktop de cadastro usa `seu.email@cimatecj.com.br` (falta o `r`); o mobile usa `@cimatecjr.com.br`. Conferir o domínio real — e lembrar que é só placeholder, não regra (seção 6).
- **Acessibilidade do toggle de senha.** O botão de mostrar/ocultar senha tem `aria-label` na tela de login e **não tem** nas de cadastro. Como o conteúdo é só um ícone, sem label ele é anunciado como botão sem nome. Padronizar nas quatro telas.
