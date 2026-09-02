# Research: Status de membro e aprovação de cadastro

Decisões técnicas resolvidas antes do desenho de dados/contratos.

## R1 — Onde a conta é criada: no cadastro pendente ou só na aprovação?

**Decision**: nada em `users`/`member_profiles` é criado no momento do cadastro
pendente. Email, hash de senha e o snapshot do membro (vindo da Supabase) ficam
em `signup_requests`. A conta só é criada no momento da aprovação.

**Rationale**: `register()` hoje cria conta **e** sessão no mesmo fluxo — é
literalmente "cadastro = login". Criar a conta antes da aprovação obrigaria a
inventar um terceiro estado ("conta existe mas não pode logar"), duplicando a
mesma informação que `isRecognizedMemberStatus`/pendência já expressam. Adiar a
criação mantém `users` como "quem pode entrar", sem estado intermediário.

**Alternatives considered**: criar a conta imediatamente com uma flag
`pending_approval` em `users` — rejeitado porque introduz um segundo lugar
(além de `signup_requests.status`) onde a mesma pendência é representada, e os
dois podem divergir.

## R2 — Autenticação no link do e-mail (decisão de 2026-08-24 com o Arthur)

**Decision**: o link do e-mail é **público e sem login** só para a
**leitura** (`GET .../by-token/:token`) — mostra os dados da solicitação sem
decidir nada, cumprindo FR-007 literalmente. A **decisão em si**
(`POST .../:id/decision`) exige sessão de admin autenticada
(`requireAuth` + `requireRole(ADMIN)`). Se o admin não estiver logado ao
clicar em Aprovar/Recusar, a tela pede login e retoma a decisão depois.

**Rationale**: a spec exige autoria "sem exceção" (SC-005) e o e-mail vai para
uma caixa institucional compartilhada (`gentegestao@cimatecjr.com.br`), não a
conta de uma pessoa. Sem login em algum ponto do fluxo, `decided_by` não tem
como ser preenchido de forma verificável — SC-005 ficaria falso por
construção. Login exigido só na escrita (não na leitura) preserva o valor do
link — ver os dados antes de decidir — sem enfraquecer o requisito de autoria.

**Consequência para FR-009**: como a decisão passa a ser autorizada por
sessão+papel, não pelo token, "uso único" deixa de fazer sentido para o
token — ele governa só a janela de leitura (7 dias), sem consumo por
visualização. Reler FR-009 como: *o link expira em 7 dias; a decisão em si é
protegida por autenticação, não pelo token*. Registrado aqui porque é uma
reinterpretação do texto original da spec, não uma escolha nova.

**Alternatives considered**: (A) sem login, `decided_by` nulo no caminho por
e-mail — rejeitado, viola SC-005 como escrito. (B) nome digitado sem
autenticação — rejeitado, não é verificável, dado de auditoria forjável.

**Impacto fora deste plano**: a tela "Confirmação de Acesso" já gerada no
Stitch mostra os botões de decisão direto, sem passo de login. Precisa de
revisão para incluir esse estado — fica registrado aqui, não é output deste
`plan.md` (specs não descrevem mockup).

## R3 — Duplicidade de solicitação (FR-016)

**Decision**: dupla proteção. `register()` primeiro consulta se já existe uma
solicitação `pending` para o email e, se existir, responde 202 idêntico sem
inserir nova linha nem despachar novo e-mail (idempotente). Como rede de
segurança contra corrida, um índice único parcial em
`signup_requests(email) WHERE status = 'pending'` garante no banco o que a
consulta prévia garante na aplicação — mesmo padrão de
`parseUniqueConstraint` já usado em `register()` para `EmailAlreadyRegisteredError`.

**Rationale**: consulta-antes-de-inserir cobre o caso comum sem custo extra;
o índice único cobre a janela de corrida entre duas requisições simultâneas,
que a consulta sozinha não fecha.

## R4 — Concorrência na decisão (FR-010)

**Decision**: a transição de estado é um `UPDATE ... WHERE id = ? AND status
= 'pending'`. Se `changes === 0`, a solicitação já foi decidida — resposta
`409`/erro de domínio "já resolvida", sem tocar a segunda tentativa.

**Rationale**: mesmo padrão de `used_at IS NULL` já usado em
`resetPassword()` — condição no `WHERE`, não checagem-depois-escrita, que
teria uma janela de corrida entre o `SELECT` e o `UPDATE`.

## R5 — Aprovação e o helper de senioridade (FR-017)

**Decision**: `isEligibleToAnchorTrainee(status: MemberStatus): boolean`,
exportado de `shared/src/schemas/member.schema.ts`. Retorna `true` para
`"active"` e `"inactive"`, `false` para `"trainee"`.

**Rationale**: nomeado pelo que a regra *decide* (quem pode ancorar um
trainee num grupo), não pelo valor que compara — isso é o que a feature 012
vai consumir sem precisar saber que `"inactive"` significa pós-júnior.
