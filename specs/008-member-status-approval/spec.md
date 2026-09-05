# Feature Specification: Status de membro e aprovação de cadastro

**Feature Branch**: `feat/status-membro-aprovacao`

**Created**: 2026-08-24

**Status**: Draft

**Input**: Backlog organizado em 2026-08-24 (features 008–016). Decisão D3: o status de membro passa a ter três valores, onde `inactive` significa pós-júnior.

> [!NOTE]
> **Emenda de 2026-09-04**: a Supabase da tec passa a conter só membros
> efetivados/ativos — pós-júnior e trainee deixam de existir nesse diretório.
> A User Story 1 abaixo (e as FRs derivadas dela) descreviam um cadastro que
> *descobria* a situação da pessoa consultando a Supabase; a partir desta
> emenda, pós-júnior e trainee **se declaram** no próprio formulário, sem
> nenhuma consulta externa, e o mecanismo de solicitação pendente (US2/US3)
> passa a ser alimentado por esses dados auto-declarados em vez do snapshot
> vindo do diretório. Detalhe em "US1 — emenda" logo abaixo e em FR-001-A a
> FR-001-D. Também renomeia `inactive` → `post_junior` (o nome antigo lia como
> "desligado", o oposto do que significava) — ver `research.md`, R6/R7.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pós-júnior e trainee conseguem solicitar cadastro (Priority: P1)

Hoje só o membro efetivado consegue criar conta na plataforma. Pós-juniores e trainees são recusados no cadastro, mesmo sendo membros legítimos da empresa. Esta história transforma a recusa em **solicitação pendente**: o membro preenche o cadastro normalmente e é informado de que sua entrada está em análise, em vez de encontrar uma porta fechada.

**Why this priority**: é o bloqueio raiz. Sem ela, pós-júnior não entra na plataforma; e sem entrar, não pode avaliar candidatos — o que trava toda a cadeia de features seguintes.

**Independent Test**: pode ser testada sozinha submetendo um cadastro com cada tipo de membro e verificando que efetivado entra direto, enquanto pós-júnior e trainee geram uma solicitação registrada e visível.

**Acceptance Scenarios**:

1. **Given** um membro efetivado da empresa, **When** ele completa o cadastro, **Then** a conta é criada imediatamente e ele acessa a plataforma, como já acontece hoje.
2. **Given** um membro pós-júnior, **When** ele completa o cadastro, **Then** nenhuma conta ativa é criada, uma solicitação pendente é registrada, e ele vê a informação de que o acesso depende de aprovação.
3. **Given** um trainee, **When** ele completa o cadastro, **Then** o comportamento é o mesmo do pós-júnior.
4. **Given** alguém que não consta como membro da empresa, **When** ele tenta se cadastrar, **Then** continua sendo recusado como hoje — esta feature não afasta a verificação de que a pessoa é membro.
5. **Given** um membro cuja situação na empresa é desconhecida pela plataforma, **When** ele tenta se cadastrar, **Then** o sistema o trata como não elegível e recusa, sem erro técnico visível.

**US1 — emenda de 2026-09-04 (substitui o mecanismo de descoberta)**: a tela de cadastro passa a ter 3 opções explícitas — **Efetivo**, **Trainee**, **Pós-júnior** — em vez de a aplicação inferir a situação consultando a Supabase para todo mundo.

- **Efetivo** mantém o comportamento acima: consulta a Supabase por e-mail, exige `status === "active"`, cria conta e sessão imediatamente. Se o e-mail não for encontrado, ou for encontrado com qualquer status diferente de `active`, o cadastro é recusado (403) — **não** vira solicitação pendente (isso é uma mudança de comportamento em relação ao cenário 2/3 originais, que caiam na fila quando a Supabase ainda retornava `inactive`/`trainee`; ver FR-001-B).
- **Trainee** e **Pós-júnior** não consultam a Supabase. A pessoa preenche, no próprio formulário: nome completo, telefone, curso, semestre, gênero e etnia (não pede data de nascimento). Esses dados alimentam a `signup_request` (US2/US3) exatamente como o snapshot da Supabase alimentava antes — o mecanismo de aprovação não muda, só a origem do dado.
- Qualquer e-mail pode escolher Trainee/Pós-júnior — não há verificação prévia de vínculo com a empresa nessa trilha; o admin continua sendo quem decide (US2/US3), e agora é o único portão de verificação para esses dois casos.
- O payload dessa trilha nunca aceita "Efetivo" como valor de situação — só os dois auto-declaráveis.

---

### User Story 2 - Admin decide a solicitação a partir do e-mail (Priority: P1)

Quando uma solicitação é criada, o admin é avisado por e-mail. O e-mail traz um link que **abre uma tela** onde ele vê quem está solicitando e decide aprovar ou recusar. A decisão só acontece quando ele age na tela.

**Why this priority**: sem a decisão, a solicitação da US1 nunca vira acesso. As duas juntas formam o ciclo mínimo utilizável.

**Independent Test**: pode ser testada disparando uma solicitação, abrindo o link do e-mail e confirmando que (a) só abrir o link não muda nada, e (b) a ação na tela concede ou nega o acesso.

**Acceptance Scenarios**:

1. **Given** uma solicitação pendente, **When** o admin abre o link do e-mail, **Then** ele vê os dados de quem solicitou e os botões de decisão — e **nenhuma decisão foi tomada** apenas por abrir.
2. **Given** a tela de decisão aberta, **When** o admin aprova, **Then** a conta do membro passa a funcionar e ele consegue entrar.
3. **Given** a tela de decisão aberta, **When** o admin recusa, **Then** o membro continua sem acesso e é informado da decisão.
4. **Given** uma solicitação já decidida, **When** alguém abre o link de novo, **Then** a tela informa que já foi resolvida e não oferece os botões.
5. **Given** um link de decisão antigo, **When** ele é aberto após o prazo de validade, **Then** a tela informa que expirou e orienta a decidir pelo painel.
6. **Given** um cliente de e-mail que carrega links automaticamente em segundo plano, **When** isso acontece com o link da solicitação, **Then** a solicitação permanece pendente e intocada.

---

### User Story 3 - Fila de solicitações no painel (Priority: P2)

O admin tem, dentro do painel, uma lista das solicitações pendentes, onde pode decidir sem depender do e-mail e consultar o que já foi decidido.

**Why this priority**: o e-mail resolve o caso comum, mas é frágil — pode ser perdido, filtrado como spam, ou ter o link expirado. A fila é a rede de segurança e o registro histórico.

**Independent Test**: pode ser testada abrindo o painel com solicitações em aberto e decidindo por ali, sem nunca abrir o e-mail.

**Acceptance Scenarios**:

1. **Given** solicitações pendentes, **When** o admin abre a fila, **Then** ele vê quem solicitou, a situação da pessoa na empresa e há quanto tempo aguarda.
2. **Given** a fila aberta, **When** o admin decide por ali, **Then** o efeito é idêntico ao da decisão pelo e-mail.
3. **Given** nenhuma solicitação pendente, **When** o admin abre a fila, **Then** ele vê um estado vazio explicando que não há nada aguardando.
4. **Given** um usuário que não é admin, **When** ele tenta acessar a fila, **Then** o acesso é negado.

---

### Edge Cases

- **Link aberto por engano ou por robô**: abrir o link nunca decide nada. A decisão exige ação explícita na tela.
- **Link reaberto depois de decidido**: continua abrindo — mostra que já foi resolvida, sem oferecer os botões (US2, cenário 4). Quem decide de fato é sempre uma sessão de admin autenticada, então reabrir o link não é a superfície de risco (ver FR-009).
- **Duas decisões ao mesmo tempo**: se dois admins decidirem a mesma solicitação simultaneamente, uma vence e a outra recebe aviso de que já foi resolvida — nunca duas decisões conflitantes gravadas.
- **Solicitação duplicada**: um membro que já tem solicitação pendente e tenta se cadastrar de novo não gera uma segunda solicitação nem um segundo e-mail.
- **Falha no envio do e-mail**: a solicitação é registrada mesmo assim e aparece na fila do painel. O cadastro não falha por causa do e-mail.
- **Situação na empresa muda entre o pedido e a decisão**: vale a situação no momento da decisão.
- **Membro aprovado que depois deixa a empresa**: fora do escopo; a desativação de conta já existe e continua sendo o mecanismo.
- **(Emenda 2026-09-04) Alguém tenta se declarar "Efetivo" na trilha auto-declarada**: rejeitado antes de qualquer gravação — o payload dessa trilha não aceita esse valor (FR-001-C).
- **(Emenda 2026-09-04) Registro residual `inactive`/`trainee` ainda aparece na Supabase**: tratado como qualquer status ≠ `active` na trilha Efetivo — recusa com 403, não vira pendência (FR-001-B).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST reconhecer exatamente três situações de membro: efetivado, pós-júnior e trainee.

**Emenda de 2026-09-04** — FR-001-A a FR-001-D substituem o mecanismo de descoberta por status (a Supabase só devolve `active` agora):

- **FR-001-A**: A tela de cadastro MUST apresentar 3 opções mutuamente exclusivas: Efetivo, Trainee, Pós-júnior.
- **FR-001-B**: A trilha Efetivo MUST continuar consultando a Supabase e exigir `status === "active"`; qualquer outro resultado (não encontrado, ou status diferente) MUST ser recusado com 403 — não MUST virar solicitação pendente.
- **FR-001-C**: As trilhas Trainee e Pós-júnior MUST NOT consultar a Supabase, e o payload delas MUST NOT aceitar "Efetivo" como situação. Todo dado de perfil (nome, telefone, curso, semestre, gênero, etnia) vem do formulário; data de nascimento não é pedida.
- **FR-001-D**: Qualquer e-mail MAY abrir uma solicitação auto-declarada (Trainee/Pós-júnior) — sem verificação prévia de vínculo; o admin (US2/US3) é o único portão para esses dois casos.
- **FR-002**: O sistema MUST tratar qualquer situação fora dessas três como não elegível, sem falhar — a origem desse dado é um sistema externo que não garante os valores.
- **FR-003**: O sistema MUST permitir que membro efetivado crie conta sem aprovação, preservando o comportamento atual.
- **FR-004**: O sistema MUST registrar uma solicitação pendente, em vez de recusar, quando o cadastro for de pós-júnior ou trainee.
- **FR-005**: O sistema MUST continuar recusando quem não é membro da empresa.
- **FR-006**: O sistema MUST notificar o admin por e-mail quando uma solicitação for criada.
- **FR-007**: O link do e-mail MUST apenas **exibir** a solicitação; abrir o link NÃO deve produzir decisão nem qualquer alteração de estado.
- **FR-008**: O sistema MUST exigir ação explícita e deliberada do admin para aprovar ou recusar.
- **FR-009**: Cada link de decisão MUST expirar após um prazo definido. A decisão em si MUST exigir uma sessão de administrador autenticada — não o token do link — porque o e-mail chega a uma caixa institucional compartilhada, não à conta de uma pessoa, e SC-005 exige autoria registrada sem exceção. *(Redação original previa "uma única decisão" pelo link — revisto em 2026-08-24 ao implementar: sem esse ajuste, SC-005 não seria satisfazível. Ver `research.md`, R2.)*
- **FR-010**: O sistema MUST impedir que uma solicitação já decidida seja decidida de novo, inclusive sob tentativas simultâneas.
- **FR-011**: O sistema MUST conceder acesso ao membro assim que a solicitação for aprovada.
- **FR-012**: O sistema MUST informar ao solicitante que seu cadastro aguarda análise, e informá-lo do resultado.
- **FR-013**: Admins MUST conseguir ver e decidir solicitações pendentes pelo painel, independentemente do e-mail.
- **FR-014**: O sistema MUST restringir a fila de solicitações e a ação de decidir a usuários admin.
- **FR-015**: O sistema MUST registrar quem decidiu cada solicitação e quando.
- **FR-016**: O sistema MUST evitar solicitações duplicadas para o mesmo membro enquanto houver uma pendente.
- **FR-017**: O sistema MUST expor a regra de senioridade (quais situações contam como "sênior o bastante") como um conceito nomeado e único, reutilizável por outras features, em vez de replicar a comparação em cada ponto de uso.
- **FR-018**: Um membro cuja solicitação foi recusada MUST poder solicitar novamente. A recusa encerra aquela solicitação; não bloqueia a pessoa.
- **FR-019**: Ao decidir, o admin MUST conseguir ver se aquela pessoa já teve solicitações recusadas antes, para decidir com contexto.
- **FR-020**: A notificação de nova solicitação MUST ser enviada a um endereço institucional único e configurável — atualmente a caixa de Gente & Gestão — e não a uma lista de destinatários individuais.
- **FR-021**: A fila do painel (US3) MUST ser suficiente por si só para descobrir e decidir solicitações. Como a notificação vai para uma caixa compartilhada que pode não ser monitorada continuamente, nenhuma solicitação pode depender de alguém ter aberto o e-mail para ser resolvida.
- **FR-022** *(emenda 2026-09-04)*: A fila do admin (painel e tela do link de e-mail) MUST indicar quando uma solicitação foi auto-declarada (Trainee/Pós-júnior sob a emenda), já que esses dados não passaram por nenhuma conferência externa.
- **FR-023** *(emenda 2026-09-04)*: O valor de status antes gravado como `inactive` passa a ser gravado e lido como `post_junior` em toda a aplicação — mesmo significado (pós-júnior), nome corrigido.

### Key Entities

- **Situação do membro**: como a empresa classifica a pessoa — efetivado, pós-júnior ou trainee. *(Emenda 2026-09-04)* Efetivado continua vindo da Supabase; pós-júnior e trainee passam a ser **auto-declarados** no cadastro, não mais lidos de um sistema externo. O valor interno de pós-júnior é `post_junior` (antes `inactive`).
- **Solicitação de cadastro**: o pedido de acesso de um pós-júnior ou trainee. Tem quem pediu, quando pediu, estado (pendente, aprovada, recusada) e — depois de decidida — quem decidiu e quando. "Expirada" descreve o *link* de leitura (FR-009), não um estado da solicitação em si — uma solicitação sem link válido continua `pendente` e decidível pelo painel. Uma mesma pessoa pode ter várias solicitações ao longo do tempo, já que a recusa não é definitiva (FR-018); o histórico delas é o que alimenta FR-019. *(Emenda 2026-09-04)* Ganha o atributo derivado "auto-declarada" (FR-022), calculado a partir da origem do identificador do membro, não uma coluna nova.
- **Link de decisão**: credencial de uso único e prazo limitado que dá ao admin acesso à tela de decisão de uma solicitação específica.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos pós-juniores e trainees hoje barrados no cadastro conseguem registrar uma solicitação.
- **SC-002**: Nenhuma solicitação muda de estado sem ação deliberada de um admin — verificável submetendo o link a carregamento automático e confirmando que segue pendente.
- **SC-003**: O admin conclui uma decisão em menos de 1 minuto a partir do momento em que abre o e-mail, supondo sessão de administrador já ativa — a exigência de login de FR-009 soma o tempo de autenticação quando não há sessão.
- **SC-004**: Nenhuma solicitação termina com duas decisões conflitantes, mesmo com dois admins agindo simultaneamente.
- **SC-005**: 100% das solicitações decididas têm registro de autor e horário.
- **SC-006**: Uma falha no envio de e-mail não impede o cadastro nem a decisão — 100% das solicitações continuam decidíveis pelo painel.
- **SC-007** *(emenda 2026-09-04)*: Uma pessoa sem nenhum registro na Supabase completa o cadastro como Trainee ou Pós-júnior e aparece na fila do admin, sem qualquer chamada ao diretório da tec.
- **SC-008** *(emenda 2026-09-04)*: Uma tentativa de declarar "Efetivo" no payload da trilha auto-declarada é rejeitada antes de qualquer escrita no banco.

## Assumptions

- **Membro efetivado não muda**: o fluxo atual permanece exatamente como está. Esta feature só acrescenta o caminho da aprovação.
- **A verificação de que a pessoa é membro já existe** e continua valendo — a aprovação é camada adicional, não substituição. *(Emenda 2026-09-04: isso deixou de valer para pós-júnior/trainee — para esses dois, não há mais verificação externa de vínculo; o admin é o único portão, ver FR-001-D.)*
- **Prazo do link**: 7 dias, prazo usual para links de ação em e-mail. Depois disso, o painel é o caminho.
- **O envio de e-mail já existe na plataforma** (usado hoje na recuperação de senha) e será reutilizado, não recriado.
- **A situação vale no momento da decisão**, não no do pedido.
- **Fora de escopo**: alterar a situação de um membro pela plataforma (esse dado pertence ao sistema da empresa); papéis de host e avaliador (feature 009); desativação de contas, que já existe.

## Dependências e impacto em outras features

- A regra de senioridade nomeada (FR-017) será consumida pela feature de **organização automática de grupos**, onde vale que um trainee não pode ser o único avaliador de um grupo — precisa de alguém efetivado ou pós-júnior ao lado. Nomear a regra aqui evita que aquela feature compare situações por conta própria.
- Esta é a **primeira** feature da cadeia 008 → 009 → 010 → 012 → 013.
