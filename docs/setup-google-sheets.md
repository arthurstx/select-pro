# Guia de setup — sincronização com Google Sheets (FEAT-0002)

Passo a passo para configurar e implementar a sincronização das inscrições com uma planilha do Google.
A spec com as decisões e o contrato está em [specs/0002-sync-google-sheets.md](../specs/0002-sync-google-sheets.md) — leia antes, este documento é só o "como fazer".

> **Custo:** zero. A Sheets API é gratuita no uso padrão, o projeto no Google Cloud não exige billing nem cartão, e Cron Triggers existem no plano gratuito do Workers.

---

## O modelo mental

Antes de clicar em qualquer coisa, vale entender o que você está montando, porque é o ponto que mais confunde quem faz isso pela primeira vez:

**Uma planilha do Google não é acessada por "API key".** O acesso funciona por identidade e permissão, igual a uma pessoa. Você vai criar um **usuário robô** (a _service account_), que tem um endereço de email próprio, e vai **compartilhar a planilha com esse robô** pelo mesmo botão "Compartilhar" que você usaria para um colega de equipe.

A permissão vem do compartilhamento, não da API. Se você pular esse passo, tudo o mais estará certo e você receberá `403`.

A parte técnica é só a prova de identidade: o robô não digita senha. Ele prova quem é assinando um documento com uma chave privada, e o Google devolve um crachá temporário (o _access token_) válido por 1 hora.

```
chave privada  →  assina um JWT  →  Google devolve access token  →  chama a Sheets API
```

---

## Parte 1 — Criar as planilhas

Você precisa de **duas**: uma para produção e outra para staging. Sem isso, um teste em `develop` escreve na planilha que o time está usando de verdade.

Para cada uma:

1. Crie uma planilha nova em [sheets.new](https://sheets.new).
2. Nomeie de forma inequívoca — por exemplo `Inscrições CIMATEC jr — PRODUÇÃO` e `Inscrições CIMATEC jr — STAGING`.
3. Renomeie a aba (a abinha embaixo, que vem como `Página1`) para exatamente **`Inscricoes`** — sem acento, sem espaço. É o nome que o job procura.
4. Na primeira linha, crie o cabeçalho com estes 15 títulos, **nesta ordem exata** (seção 8.2 da spec):

   | A    | B                   | C      | D       | E          | F       | G          | H        |
   | ---- | ------------------- | ------ | ------- | ---------- | ------- | ---------- | -------- |
   | `id` | `Data de inscrição` | `Nome` | `Email` | `Telefone` | `Curso` | `Semestre` | `Gênero` |

   | I           | J               | K                           | L                       | M           | N                       | O                        |
   | ----------- | --------------- | --------------------------- | ----------------------- | ----------- | ----------------------- | ------------------------ |
   | `Cor/Etnia` | `Como conheceu` | `Como conheceu (descrição)` | `Experiências e skills` | `Motivação` | `Restrição aos sábados` | `Necessidades especiais` |

5. Anote o **id da planilha**. Ele está na URL, entre `/d/` e `/edit`:

   ```
   https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit#gid=0
                                          └────┬────┘
                                        esse é o id
   ```

> **Sobre privacidade:** essa planilha vai conter nome, email, telefone, cor/etnia e informação de necessidades especiais dos candidatos. Compartilhe sempre **nominalmente**, com quem opera a seleção. Nunca use "qualquer pessoa com o link" e nunca publique na web (seção 13 da spec).

---

## Parte 2 — Criar o projeto e a service account no Google Cloud

Tudo aqui é feito em [console.cloud.google.com](https://console.cloud.google.com). Um único projeto atende os dois ambientes.

### 2.1 Criar o projeto

1. No seletor de projeto no topo da página, clique em **Novo projeto**.
2. Nome: algo como `select-pro`. Não precisa de organização.
3. Crie e **aguarde a seleção do projeto novo** no seletor do topo — é comum continuar configurando no projeto errado sem perceber.

Não é pedido cartão de crédito. Se aparecer alguma tela oferecendo teste gratuito ou ativação de billing, pode ignorar: a Sheets API não precisa.

### 2.2 Habilitar a Sheets API

1. Menu lateral → **APIs e serviços** → **Biblioteca**.
2. Busque por `Google Sheets API`.
3. Abra e clique em **Ativar**.

Só isso. Não mexa em "Tela de consentimento OAuth" — aquilo é para aplicações que agem em nome de um usuário humano, que não é o nosso caso.

### 2.3 Criar a service account

1. Menu lateral → **APIs e serviços** → **Credenciais**.
2. **Criar credenciais** → **Conta de serviço**.
3. Nome: `select-pro-sheets-sync`. O id é preenchido sozinho.
4. Nas etapas seguintes, sobre conceder papéis (_roles_) e acesso de usuários: **pule as duas, deixe em branco**. Papéis do IAM controlam recursos do Google Cloud; o acesso à planilha vem do compartilhamento, não daqui.
5. Concluir.

Na lista de contas de serviço, copie o **email** da conta criada — algo como `select-pro-sheets-sync@select-pro-123456.iam.gserviceaccount.com`. É ele que você vai usar na Parte 3.

### 2.4 Gerar a chave privada

1. Clique na service account recém-criada.
2. Aba **Chaves** → **Adicionar chave** → **Criar nova chave**.
3. Tipo: **JSON**. Criar.
4. O navegador baixa um arquivo `.json`. **É o download único da chave** — o Google não mostra de novo. Se perder, apague a chave e gere outra.

Esse arquivo é a credencial completa da conta. Regras:

- **Nunca** dentro do repositório, nem mesmo temporariamente. Salve fora, por exemplo em `~/`.
- **Nunca** commitado, nem em `.dev.vars` versionado.
- Depois de cadastrar os secrets (Parte 4), apague o arquivo do disco.

Abrindo o arquivo, os dois campos que importam são `client_email` (o mesmo email da service account) e `private_key` (a chave em si). O restante é metadado.

---

## Parte 3 — Compartilhar as planilhas com a service account

**Este é o passo que costuma ser esquecido.** Sem ele nada funciona.

Para **cada uma** das duas planilhas:

1. Abra a planilha e clique em **Compartilhar**.
2. Cole o **email da service account** (o `client_email` do JSON).
3. Permissão: **Editor**.
4. Desmarque "Notificar as pessoas" — não existe caixa de entrada do outro lado.
5. Enviar/Concluir.

Verificação: reabrindo o painel de compartilhamento, o email da service account deve aparecer listado como Editor.

---

## Parte 4 — Configurar o Worker

Todos os comandos rodam a partir de `api/`.

### 4.1 Cadastrar a chave como secret

**O arquivo `.json` inteiro** — do `{` ao `}`, com `client_email`, `project_id`, `private_key` e todo o resto — vira o valor de **um único secret**, chamado `GOOGLE_SERVICE_ACCOUNT_KEY`. Não é para separar os campos em variáveis diferentes, nem para extrair só a chave. É por isso que os comandos abaixo mandam o conteúdo do arquivo direto para o `wrangler`.

Em runtime, o código lê esse secret, faz `JSON.parse` e tira de lá os dois campos que usa: `client_email` (identifica quem assina o JWT) e `private_key` (assina). Os demais campos são ignorados.

> **Por que não guardar só a `private_key`:** dentro do arquivo, a chave aparece como `"-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"`. Aqueles `\n` são dois caracteres literais, barra e `n` — JSON não permite quebra de linha crua dentro de uma string, então o Google escapa cada uma. Passando pelo `JSON.parse`, é o próprio parser que devolve as quebras de linha reais e a chave chega como um PEM válido. Copiando só esse valor para uma var solta, não há `JSON.parse` no caminho: as barras chegam literais ao código, o PEM não é reconhecido e a importação da chave falha com um erro genérico, que não menciona quebra de linha nenhuma. É a falha mais chata de depurar nesta integração.

Produção:

```bash
cat ~/select-pro-chave.json | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY
```

Staging:

```bash
cat ~/select-pro-chave.json | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY --env staging
```

Confira o que existe em cada ambiente:

```bash
npx wrangler secret list
```

```bash
npx wrangler secret list --env staging
```

Feito isso, **apague o arquivo JSON do disco**.

### 4.2 Configurar o ambiente local

Adicione `GOOGLE_SERVICE_ACCOUNT_KEY` a `api/.dev.vars` (que já existe e é ignorado pelo git), com o mesmo JSON completo da seção anterior — mas aqui ele precisa estar **numa única linha**. O `.dev.vars` é lido linha a linha, no formato `CHAVE=valor`, então um JSON identado em várias linhas quebra o arquivo. Minifique antes de colar (qualquer editor faz isso; `jq -c . arquivo.json` também resolve).

Registre também a chave, sem valor, em `api/.dev.vars.example` — é o arquivo versionado que documenta o que precisa ser preenchido, hoje só com `DOCS_PASSWORD=`.

> Essa restrição de linha única vale **só** para o `.dev.vars`. No `wrangler secret put` da seção anterior o arquivo vai como está, identado, sem problema.

### 4.3 Declarar as variáveis e o cron no `wrangler.jsonc`

Três alterações, e a segunda e a terceira precisam ser feitas **em dois lugares**:

1. Em `vars`, na raiz: `GOOGLE_SHEET_ID` com o id da planilha de **produção**.
2. Em `env.staging.vars`: o mesmo `GOOGLE_SHEET_ID`, com o id da planilha de **staging**.
3. Um bloco `triggers` com `crons`, contendo a expressão `0 * * * *` (de hora em hora) — **na raiz e também dentro de `env.staging`**.

> **Por que duplicar:** ambientes do Wrangler não herdam a configuração da raiz. É por isso que `assets`, `d1_databases` e `vars` já aparecem repetidos dentro de `env.staging` no arquivo atual. Um `triggers` declarado só na raiz simplesmente não existiria em staging.
>
> **Por que o id da planilha vai versionado e não por `--var` no deploy:** o projeto tem CD por push, e ele sobrescreve deploy manual — foi o que aconteceu na migration 0004, com o CD revertendo `MAINTENANCE_MODE` 18 segundos depois do deploy manual (ver `CONTEXT.md`). Valor que precisa sobreviver a um push tem que estar no arquivo.

Depois de editar, regenere os tipos para que as variáveis novas apareçam em `CloudflareBindings`:

```bash
npm run cf-typegen --workspace=api
```

---

## Parte 5 — Roteiro de implementação

Ordem sugerida, do mais isolado para o mais integrado. Cada etapa é testável sozinha, o que evita depurar autenticação e formatação de linha ao mesmo tempo.

### 5.1 Mover os mapas de rótulo para `shared`

`COURSE_LABELS` já está em `shared/src/schemas/candidate.schema.ts`. Os outros três ainda estão no front:

| Mapa                     | Onde está hoje                                                    |
| ------------------------ | ----------------------------------------------------------------- |
| `GENDER_LABELS`          | `front/app/inscricao/_components/candidate-registration-form.tsx` |
| `ETHNICITY_LABELS`       | `front/app/inscricao/_components/availability-step-form.tsx`      |
| `REFERRAL_SOURCE_LABELS` | `front/app/inscricao/_components/referral-step-form.tsx`          |

Mova os três para junto de `COURSE_LABELS`, tipados como `Record<T, string>` sobre o tipo do enum, e faça os componentes do front importarem de `shared`. Comece por aqui: é a única mudança que atravessa os três workspaces, e deixa o front funcionando igual antes de você tocar em qualquer coisa nova.

### 5.2 Cliente do Google — `api/src/lib/`

Duas responsabilidades, nesta ordem.

**Obter o access token.** O fluxo é: montar um JWT, assiná-lo, trocá-lo por um token.

- Cabeçalho do JWT: algoritmo `RS256`, tipo `JWT`.
- Claims: `iss` = o `client_email`; `scope` = `https://www.googleapis.com/auth/spreadsheets`; `aud` = `https://oauth2.googleapis.com/token`; `iat` = agora em segundos; `exp` = agora + 3600.
- Cabeçalho e claims vão em **base64url** (alfabeto com `-` e `_`, sem `=` de padding), unidos por ponto. Essa string é o que se assina.
- A assinatura usa a WebCrypto do runtime: importar a `private_key` (formato PKCS#8, é o que vem no JSON, entre `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----`, com o miolo em base64) e assinar com `RSASSA-PKCS1-v1_5` + SHA-256. A assinatura também vai em base64url, concatenada com mais um ponto.
- Trocar o JWT por token: `POST` para `https://oauth2.googleapis.com/token`, corpo `application/x-www-form-urlencoded`, com `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` e `assertion=<o JWT>`.
- A resposta traz `access_token`. Ele vai no header `Authorization: Bearer <token>` das chamadas seguintes.

**Ler e escrever na planilha.** Duas chamadas REST, ambas com o Bearer:

- Ler os ids já espelhados: `GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/Inscricoes!A:A`
- Ler o cabeçalho para validar: mesma rota, faixa `Inscricoes!A1:O1`
- Acrescentar linhas: `POST https://sheets.googleapis.com/v4/spreadsheets/{id}/values/Inscricoes!A:O:append`, com `valueInputOption=RAW` e `insertDataOption=INSERT_ROWS` na query. O corpo leva as linhas como lista de listas.

> `valueInputOption=RAW` não é detalhe: ele é o que impede que um texto livre começando com `=` seja interpretado como fórmula pela planilha.

Ponto de parada útil: com essa camada pronta, dá para escrever uma linha fixa de teste na planilha de staging e confirmar que auth e permissão estão certas, antes de existir qualquer lógica de negócio.

### 5.3 Leitura do D1 — `api/src/repositories/candidates.repository.ts`

Um método novo que devolve todas as inscrições com o join entre `candidates` e `candidate_applications`, ordenadas por `created_at` crescente. SQL puro com `.bind()`, como o resto do arquivo — sem ORM (`api/.agents/architecture/SKILL.md`).

### 5.4 Orquestração — `api/src/services/`

Um service novo (`sheet-sync.service.ts`) que recebe o repositório e o cliente de planilha pelo construtor e executa o fluxo da seção 4.1 da spec: verificar manutenção, validar cabeçalho, ler os ids, calcular o diff, formatar as linhas, acrescentar.

Ele não pode conhecer o Hono nem o `fetch`. É o que permite testá-lo com um cliente de planilha falso.

### 5.5 Entry point — `api/src/index.ts`

Hoje o arquivo termina exportando a instância do Hono diretamente. Para um Worker com cron, o `export default` precisa expor **dois** handlers: o `fetch` (o do Hono, sem mudança de comportamento) e o `scheduled`, que recebe o evento do cron, o `env` e o contexto de execução.

É a única alteração em código existente que esta feature exige.

### 5.6 Testes — `api/test/`

No mínimo: fluxo feliz (planilha vazia → todas as linhas), nada a fazer (planilha em dia → nenhuma escrita), diff parcial, cabeçalho divergente (aborta sem escrever) e modo de manutenção (não lê o banco). Todos com cliente de planilha falso, sem rede.

---

## Parte 6 — Testar localmente

O `wrangler dev` expõe uma rota que dispara o handler agendado sob demanda, sem esperar o horário do cron.

Em um terminal:

```bash
npm run dev --workspace=api
```

Em outro:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

Aponte o ambiente local para a planilha de **staging** enquanto testa.

Roteiro de verificação:

1. Rode com a planilha vazia (só o cabeçalho) e um candidato no banco local → a linha aparece.
2. Rode de novo sem mudar nada → **nada é escrito**. Se duplicar, o diff está errado.
3. Apague uma linha na planilha e rode → ela volta.
4. Renomeie o cabeçalho de uma coluna e rode → nada é escrito e o log acusa cabeçalho divergente.

---

## Parte 7 — Deploy

Na ordem, e sem pular a verificação em staging:

1. Confirme que o secret existe nos **dois** ambientes (`wrangler secret list`). Um deploy com cron e sem secret gera uma falha a cada execução.
2. Faça o push para `develop`. O CD publica em staging sozinho.
3. Aguarde o próximo tick e confira a planilha de staging. Lembre que deploy da Cloudflare não propaga na hora — as duas versões convivem por algumas dezenas de segundos (`CONTEXT.md`).
4. Acompanhe os logs em tempo real:

   ```bash
   npx wrangler tail --env staging
   ```

5. Com staging validado, promova para `master`.
6. Confira a planilha de produção após o primeiro tick. Na primeira execução ela recebe **todas** as inscrições já existentes no banco de uma vez — é o comportamento esperado.

---

## Parte 8 — Se der errado

| Sintoma                                       | Causa provável                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `403` da Sheets API                           | A planilha não foi compartilhada com o email da service account (Parte 3), ou foi compartilhada só uma das duas                              |
| `404` da Sheets API                           | `GOOGLE_SHEET_ID` errado, ou apontando para a planilha do outro ambiente                                                                     |
| `400` com `invalid_grant` na troca do JWT     | Claims do JWT incorretas (`aud` ou `scope`), `exp` no passado, ou relógio muito fora de sincronia                                            |
| Erro ao importar a chave privada              | A `private_key` chegou com `\n` literal em vez de quebra de linha — sintoma de ter guardado a chave solta em vez do JSON inteiro (seção 4.1) |
| `429`                                         | Quota por minuto excedida. Não deveria acontecer neste volume; se acontecer, suspeite de laço de retry                                       |
| O cron não dispara em staging                 | Bloco `triggers` declarado só na raiz do `wrangler.jsonc`. Ambientes não herdam (seção 4.3)                                                  |
| Linhas duplicadas                             | O diff não está lendo a coluna de ids, ou está comparando com formatação diferente da que foi escrita                                        |
| Nada acontece e não há erro no log            | `MAINTENANCE_MODE` está `"true"` — o job encerra de propósito (E7 da spec)                                                                   |
| Funcionava e parou depois de um deploy manual | O CD por push sobrescreveu as vars do deploy manual (`CONTEXT.md`)                                                                           |

Para investigar qualquer um deles, os logs do Worker são o ponto de partida:

```bash
npx wrangler tail --env staging
```
