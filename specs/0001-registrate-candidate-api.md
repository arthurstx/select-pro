# SPEC — Registro de Candidato

ID: FEAT-0001
Módulo: Registro de candidatos
Versão: 1.1
Data: 2026-08-01
Status: DRAFT

---

## 1. Objetivo

Permitir que um candidato se cadastre no processo seletivo em dois passos:

1. **Pré-registro**: candidato envia seus dados gerais (nome completo, email institucional, curso, semestre, gênero, telefone). O sistema valida os dados, guarda os dados temporariamente no KV (junto com o OTC) e envia o código por email. **O candidato ainda não existe no banco de dados nesse momento.**
2. **Confirmação**: candidato envia o OTC recebido. O sistema valida o código, cria o candidato definitivamente no banco de dados e remove a entrada do KV.

Essa escolha evita que um candidato "reserve" um email/telefone sem nunca confirmar — só existe registro persistente no banco após a confirmação. O KV atua como storage transitório com TTL, eliminando a necessidade de um job de limpeza para candidatos que nunca confirmam.

O OTC é uma entidade genérica e tipada (ex: `confirm-email`, `reset-password`), para que o mesmo mecanismo possa ser reutilizado por outras features sem risco de um código gerado para um propósito ser aceito em outro.

**Fora do escopo desta spec:** autenticação/login do candidato (o candidato não possui conta na aplicação), avaliação do candidato, e qualquer fluxo de OTC que não seja `confirm-email` (outros tipos são mencionados apenas para não travar o design do schema).

---

## 2. Atores

- **Ator primário:** candidato

**Restrição:** candidato não possui login na plataforma; a confirmação do OTC é a única barreira de validação de identidade neste fluxo.

---

## 3. User Story

```gherkin
Como candidato,
Eu quero me cadastrar na plataforma inserindo meus dados gerais
e confirmando meu email via código,
Para eu poder ser avaliado posteriormente na aplicação.
```

---

## 4. Fluxo Principal (Happy Path)

> Esta spec cobre apenas a camada de API/backend. O gatilho de UI (formulário, tela de inserção de código) está fora do escopo.

### 4.1 Pré-registro — `POST /candidate/pre-register`

1. Candidato envia seus dados gerais.
2. Sistema valida:
   - formato de email
   - formato de telefone
   - email já cadastrado (candidato **confirmado**, existente no banco)
   - telefone já cadastrado (candidato **confirmado**, existente no banco)
3. Sistema gera um novo `pendingId` (UUID v4) e grava `pending-registration:<pendingId>` no KV com os dados do candidato + OTC (código, tipo `confirm-email`, expiração, tentativas).
4. Sistema envia o OTC por email.
5. Sistema retorna `201 Created` com o `pendingId` (usado pelo cliente na etapa de confirmação).

> Reenviar o pré-registro com o mesmo email antes de confirmar gera um novo `pendingId` independente (a entrada anterior não é localizada nem sobrescrita — ver seção 10). Isso é aceitável: o candidato pode receber mais de um email de código se reenviar, mas qualquer um dos códigos válidos confirma o cadastro.

### 4.2 Confirmação — `POST /candidate/confirm-otc`

1. Candidato envia `pendingId` + código recebido.
2. Sistema busca `pending-registration:<pendingId>` no KV.
3. Sistema valida:
   - entrada existe no KV (senão, código expirado ou nunca gerado)
   - código é do tipo `confirm-email`
   - código informado bate com o armazenado
   - número de tentativas não excedido
4. Sistema cria o candidato no banco de dados, gerando um **novo id** (não reaproveita o `pendingId` — ver seção 13 para o motivo de segurança).
   - **Defesa principal contra duplicidade concorrente:** o insert deve respeitar constraints `unique` de email e telefone no banco. Como não há índice de pendentes no KV, esta é a única barreira contra dois pré-registros simultâneos com o mesmo email/telefone — não um cenário residual, é o caminho esperado de detecção nesse caso raro (ver E10).
   - Se o insert falhar por violação de constraint, o sistema deve inspecionar qual constraint foi violada (nome/campo retornado pelo erro do banco) para devolver uma mensagem específica (email vs. telefone), em vez de um erro genérico.
5. Sistema remove `pending-registration:<pendingId>` do KV.
6. Sistema retorna `200 OK` com os dados do candidato confirmado.

---

## 5. Fluxos Alternativos e Erros

| #   | Cenário                                             | Condição                                                                                                                                    | Ação                                                                                                                                  | Código HTTP             |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| E1  | Email já cadastrado                                 | email pertence a candidato `confirmed` no banco                                                                                             | bloquear pré-registro                                                                                                                 | `409 Conflict`          |
| E2  | Telefone já cadastrado                              | telefone pertence a candidato `confirmed` no banco                                                                                          | bloquear pré-registro                                                                                                                 | `409 Conflict`          |
| E3  | Email inválido                                      | formato de email incorreto                                                                                                                  | bloquear pré-registro                                                                                                                 | `400 Bad Request`       |
| E4  | Telefone inválido                                   | formato de telefone incorreto                                                                                                               | bloquear pré-registro                                                                                                                 | `400 Bad Request`       |
| E5  | OTC expirado / não encontrado                       | entrada não existe mais no KV (TTL venceu)                                                                                                  | bloquear confirmação                                                                                                                  | `410 Gone`              |
| E6  | OTC inválido                                        | código não bate com o armazenado                                                                                                            | bloquear confirmação                                                                                                                  | `400 Bad Request`       |
| E7  | OTC de tipo incorreto                               | entrada existe mas `type !== 'confirm-email'`                                                                                               | bloquear confirmação                                                                                                                  | `400 Bad Request`       |
| E9  | Excesso de tentativas                               | tentativas de confirmação > limite definido                                                                                                 | invalidar entrada e exigir novo pré-registro                                                                                          | `429 Too Many Requests` |
| E10 | Email ou telefone em uso (detectado na confirmação) | insert no banco viola constraint `unique` de email ou telefone — outro candidato confirmou primeiro entre o pré-registro e esta confirmação | inspecionar qual constraint falhou e retornar erro específico (email ou telefone); manter KV para nova tentativa com dados corrigidos | `409 Conflict`          |

> Removido o cenário "OTC já utilizado" (E8) como erro separado: como a entrada do KV é deletada assim que o candidato é criado (passo 5 do fluxo 4.2), uma segunda tentativa de confirmação com o mesmo código cai naturalmente em E5 (não encontrado), sem precisar de um estado "consumido" explícito.

---

## 6. Critérios de Aceite

- [ ] Email válido e não duplicado entre candidatos `confirmed`
- [ ] Telefone válido e não duplicado entre candidatos `confirmed`
- [ ] OTC gerado sempre com um `type` explícito
- [ ] Confirmação só aceita OTC do tipo `confirm-email`
- [ ] OTC expira após tempo definido (ver seção 9)
- [ ] OTC não pode ser reutilizado após consumo
- [ ] Tentativas de confirmação são limitadas

---

## 7. Fora de Escopo

- Avaliação do candidato
- JWT / autenticação do candidato
- Outros tipos de OTC além de `confirm-email` (schema deve suportá-los, mas nenhum outro fluxo é implementado aqui)
- Reenvio manual de OTC (endpoint de "reenviar código") — considerar spec separada se necessário

---

## 8. Dados e Modelos

### 8.1 TypeScript Schema

```ts
// Entidade definitiva — só existe no banco após confirmação
type Course =
  | "eng-comp"
  | "eng-civil"
  | "eng-mecani"
  | "eng-quimica"
  | "eng-prod"
  | "eng-automação"
  | "eng-eletri"
  | "arqui";

type Semester = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

type Gender = "mascu" | "fem" | "outro";

interface CandidateRow {
  id: string; // gerado no momento da criação — nunca reaproveita o pendingId

  course: Course;
  semester: Semester;
  gender: Gender;

  name: string;
  email: string;
  phone: string;

  created_at: string;
  updated_at: string | null;
}

// Entidade transitória — vive apenas no KV, chave: `pending-registration:<pendingId>`
// pendingId é um UUID v4 gerado no pré-registro, usado apenas como token
// de posse temporário para a etapa de confirmação — nunca vira CandidateRow.id.
type OtcType = "confirm-email" | "reset-password";

interface PendingRegistration {
  candidate: {
    name: string;
    email: string;
    phone: string;
    course: Course;
    semester: Semester;
    gender: Gender;
  };
  otc: {
    code_hash: string; // nunca armazenar o código em texto plano
    type: OtcType; // fixo em "confirm-email" neste fluxo
    attempts: number;
    max_attempts: number;
    expires_at: string; // deve ser igual ao TTL da chave no KV
  };
  created_at: string;
}
```

**Pontos de atenção para quem for implementar:**

- `code_hash`: o OTC não deve ser armazenado em texto plano, mesmo em storage com TTL automático — se o storage vazar, o código não pode ser recuperável diretamente.
- `type` existe para impedir que uma entrada gerada para `reset-password` (fora de escopo aqui, mas o schema já contempla — em outra feature, provavelmente com chave própria) seja aceita por engano no endpoint de `confirm-email`. A validação de tipo é obrigatória no passo 3 do fluxo 4.2 — é a regra que evita uso indevido mencionada no objetivo.
- `PendingRegistration` combina candidato + OTC numa única chave/valor do KV — é a **única** chave usada neste fluxo (sem índices secundários por email/telefone).
- `pendingId` **não** deve virar `CandidateRow.id`: ele circula em contextos menos controlados durante a fase pendente (resposta HTTP, estado do cliente, possivelmente logs), então reaproveitá-lo estenderia esse nível de exposição para a vida inteira do registro. O `id` final é gerado do zero no momento do insert.
- Unicidade de `email`/`phone` no `CandidateRow` é garantida via constraint `unique` no banco — é a **única** barreira contra duas pessoas pré-registrando com o mesmo email/telefone antes de qualquer uma confirmar. Isso é aceitável porque exige coincidência num universo de emails institucionais (praticamente únicos por natureza) dentro da janela de expiração do OTC. Ver E10 (seção 5).
- `attempts`/`max_attempts`: cada tentativa de confirmação falha (E6, E7) incrementa `attempts` dentro da própria entrada do KV; ao atingir `max_attempts`, a entrada deve ser deletada do KV (força um novo pré-registro, ver E9).

### 8.2 Request Body

**`POST /candidate/pre-register`**

```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "course": "eng-comp",
  "semester": 1,
  "gender": "mascu"
}
```

**`POST /candidate/confirm-otc`**

```json
{
  "pendingId": "uuid",
  "code": "string"
}
```

> `type` **não** é enviado pelo cliente nesse endpoint — é fixado como `confirm-email` no backend, já que este endpoint só serve a esse propósito. O `type` armazenado na entrada do KV é comparado internamente contra esse valor fixo (ver E7). O `pendingId` é o que o cliente recebeu na resposta do `pre-register` (seção 8.3) — não é necessário reenviar o email.

### 8.3 Response — Sucesso

**`POST /candidate/pre-register` (`201 Created`)**

```json
{
  "data": {
    "pendingId": "uuid",
    "message": "Código enviado por email",
    "expiresAt": "timestamp"
  }
}
```

> O `pendingId` deve ser guardado pelo cliente (estado da tela) para ser reenviado no `confirm-otc`. Não é o `id` do candidato ainda — o candidato só existe no banco após a confirmação, mas reaproveita este mesmo UUID como seu `id` definitivo (ver seção 8.1).

**`POST /candidate/confirm-otc` (`200 OK`)**

```json
{
  "data": {
    "id": "uuid",
    "status": "confirmed",
    "name": "string",
    "email": "string",
    "updatedAt": "timestamp"
  }
}
```

### 8.4 Response — Erros

> Seguir o padrão de envelope de erro já usado no projeto (não redefinido aqui). Os códigos HTTP de cada cenário estão na seção 5.

---

## 9. Requisitos Técnicos Definidos

| Requisito                                            | Decisão                                                                                                                                    | Justificativa                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expiração do OTC                                     | A definir (ex: 10–15 min é padrão de mercado para confirm-email)                                                                           | Códigos de confirmação de email de vida curta reduzem janela de abuso; valor exato fica a critério do time                                                                                                                                            |
| Limite de tentativas                                 | A definir (ex: 5 tentativas)                                                                                                               | Mitiga força bruta contra o código de 6 dígitos                                                                                                                                                                                                       |
| Storage do candidato + OTC no KV                     | Confirmado — `PendingRegistration` completo (dados do candidato + OTC) fica no KV, chave `pending-registration:<email>`, até a confirmação | Elimina estado `pending` no banco; TTL do KV cuida da limpeza automática de registros nunca confirmados, sem job dedicado                                                                                                                             |
| TTL da chave do KV                                   | **Deve** ser igual ao `expires_at` gravado dentro do `PendingRegistration`                                                                 | Evita duas fontes de verdade sobre expiração — se divergirem, a entrada pode sumir do KV antes do valor interno indicar expiração (ou o contrário)                                                                                                    |
| Consistência do KV                                   | KV é eventualmente consistente entre regiões (Cloudflare KV)                                                                               | Pode haver janela curta em que um pré-registro recém-gravado não esteja visível em todas as edges — relevante se pré-registro e confirmação acontecerem em datacenters diferentes muito próximos no tempo                                             |
| Chave primária do KV                                 | UUID v4 (`pendingId`), gerado no pré-registro, usado só como token de posse temporário — **não** vira `CandidateRow.id`                    | Evita estender a exposição do id (presente em resposta HTTP e estado do cliente durante a fase pendente) para a vida inteira do registro. O `id` final é gerado no insert                                                                             |
| Checagem de email/telefone duplicado entre pendentes | Não implementada via KV — a única barreira é a constraint `unique` do banco, verificada na confirmação                                     | Simplicidade: 1 chave no KV em vez de 3. Aceito porque o universo de emails é institucional (baixa chance real de colisão) e o impacto de cair no caso raro é apenas um erro específico na tela de confirmação, não perda de dados. Ver E10 (seção 5) |
| Erro de constraint na confirmação                    | O backend deve inspecionar qual constraint (email ou telefone) foi violada no erro do insert e devolver mensagem específica, não genérica  | Sem os índices do KV, este é o único ponto de detecção — a mensagem específica preserva parte da qualidade de UX que os índices dariam, sem chaves extras                                                                                             |

---

## 10. Perguntas Esclarecidas / Em Aberto

| #   | Pergunta                                                                                                      | Resposta                                                                                                                                                                                                 | Decidido em |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | O candidato é persistido no pré-registro ou só na confirmação?                                                | **Resolvido: só na confirmação.** Dados intermediários ficam no KV, não no banco                                                                                                                         | 2026-08-01  |
| 2   | Um novo pré-registro com email já pendente deve bloquear, sobrescrever ou gerar um novo OTC independente?     | **Resolvido: gerar um novo `pendingId` independente** (sem índice por email no KV, não há como localizar/sobrescrever o anterior — o candidato pode ter mais de um código válido simultâneo se reenviar) | 2026-08-01  |
| 3   | Registros pendentes nunca confirmados precisam de job de limpeza?                                             | **Resolvido: não** — TTL do KV cuida disso automaticamente                                                                                                                                               | 2026-08-01  |
| 4   | Tempo de expiração e limite de tentativas do OTC                                                              | Não definido (ver seção 9)                                                                                                                                                                               | Pendente    |
| 5   | Falha no envio do email (provedor externo) deve impedir a gravação no KV, ou a entrada fica órfã até expirar? | Não definido                                                                                                                                                                                             | Pendente    |

## 11. Dependências Externas

- **Provedor de envio de email** (ex: Resend) — usado para entregar o OTC ao candidato. A spec não depende de qual provedor é usado, apenas assume que o envio é assíncrono e pode falhar (implementador deve decidir se falha de envio deve reverter o pré-registro ou apenas logar/alertar).
- **Storage do OTC** (ex: KV) — ver seção 9 para a regra de negócio que essa escolha implica (TTL).

---

## 12. Métricas de Sucesso

> Sugestões para discutir com o time de produto:
>
> - Taxa de conversão pré-registro → confirmação
> - Tempo médio entre envio do OTC e confirmação
> - Taxa de expiração de OTC (indicativo de tempo de expiração mal calibrado)

---

## 13. Notas e Observações

- O campo `type` no OTC foi adicionado para suportar reuso futuro do mecanismo (ex: reset de senha em outra feature) sem que um código gerado para um propósito seja aceito em outro endpoint.
- Guardar o candidato inteiro (não só o OTC) no KV até a confirmação elimina o estado `pending` no banco — a tabela de candidatos só contém quem de fato confirmou.
- O `pendingId` funciona como um token de posse temporário, não como identidade permanente — ele não vira `CandidateRow.id` por uma questão de segurança: reduzir a superfície de exposição de um identificador que vai persistir para sempre, já que o `pendingId` circula em contextos menos controlados (resposta HTTP, estado do cliente) durante a fase pendente.
- A decisão de não indexar email/telefone dos pendentes no KV é uma simplificação deliberada: o preço é que dois pré-registros concorrentes com o mesmo email/telefone só são detectados na confirmação (constraint do banco), em vez de no próprio pré-registro. Isso afeta pouquíssimos usuários na prática — exige duas pessoas usando o mesmo email institucional quase ao mesmo tempo — e mesmo quando afeta, o pior caso é um erro específico e recuperável na tela de confirmação, não perda de dados.
- Para manter a mensagem de erro específica (email vs. telefone) mesmo sem os índices, o backend precisa inspecionar qual constraint do banco falhou no insert (E10) — isso é um requisito funcional, não um detalhe de implementação, porque afeta o que o candidato vê na tela.
- Ainda falta decidir o comportamento se o envio do email falhar depois que a entrada já foi gravada no KV (pergunta 5, seção 10) — isso é relevante para o prompt de implementação, já que muda se a gravação no KV e o envio do email acontecem numa ordem que permite rollback.
