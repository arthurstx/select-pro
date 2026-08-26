# Backlog — select-pro

Fonte única do que está feito e do que falta. Espelha `specs/` (features numeradas 0001–0007)
e o backlog 008–016 organizado em 2026-08-24 (detalhe completo em `CONTEXT.md`, seção
"Backlog de specs 008–016"). Atualizar aqui sempre que uma feature muda de estado — é o que
torna este arquivo confiável em vez de mais um registro que ninguém confere.

## Concluído

- [x] **FEAT-0001** — Inscrição do candidato na plataforma. Wizard de 6 etapas
      (`front/app/inscricao/`), `POST /candidate/register` (`api/src/routes/candidates.routes.ts`).
- [x] **FEAT-0002** — Sincronização de inscrições com Google Sheets (`SheetSyncService`,
      cron de hora em hora). Implementação própria do Arthur.
- [x] **FEAT-0003** — Inscrição/autenticação dos avaliadores. 8 rotas em
      `api/src/routes/auth.routes.ts`; telas em `front/app/(auth)/` (`login`, `cadastro`,
      `recuperar-senha`, `redefinir-senha`); migration `0005`.
- [x] **FEAT-0005** — Check-in de candidatos (`front/app/painel/check-in/`,
      `api/src/routes/checkin.routes.ts`, migration `0006`).
- [x] **FEAT-0006** — Unicidade de email/telefone por edição + padronização de telefone
      (migration `0007`). Terceiro item da spec original (tela de logs) ficou de fora — ver
      backlog abaixo.
- [x] **FEAT-0007** — Dashboard de inscrições (`front/app/painel/`, `api/src/routes/dashboard.routes.ts`).
- [x] **FEAT-0008** — Status de membro (`active`/`inactive`/`trainee`) e aprovação de
      cadastro de pós-júnior/trainee. Migration `0008`. `specs/008-member-status-approval/`.
- [x] **FEAT-0011** — Cadastro de salas, com hosts/limite de grupos derivados da capacidade
      (D5). Migration `0009`. `specs/011-cadastro-de-salas/`.
- [x] **FEAT-0009** — Papel de host por edição do processo seletivo + painel de avaliadores
      (toggle host↔avaliador, filtro por cargo). Migration `0010`. `specs/009-papel-de-host/`.
- [x] **FEAT-0014** — Necessidades especiais: descrição condicional ao boolean existente.
      Migration `0011`. `specs/014-necessidades-especiais-descricao/`.
- [x] **FEAT-0015** — Filtro por curso no check-in e no dashboard (mesma tela do "painel" —
      confirmado durante a implementação que são a mesma coisa). Sem migration.
      `specs/015-filtro-por-curso/`.
- [x] **FEAT-0016** — Exportação de candidatos em CSV, admin-only, com log de auditoria
      append-only (`candidate_export_events`). Migration `0012`. `specs/016-exportacao-csv-candidatos/`.
      Botão no painel implementado à parte, sem ciclo do spec-kit (tarefa pequena — ver
      "Convenção" abaixo); inclui o filtro de curso da FEAT-0015 no recorte exportado.
- [x] **FEAT-0010** — Check-in de membros (avaliadores/hosts), admin-only, com histórico
      append-only (`member_checkin_events`) espelhando `checkin_events` da FEAT-0005; e
      sinalização online/presencial no check-in de candidatos já existente, derivada de
      `saturday_restriction` (D7), sem campo novo. Migration `0013`. `front/app/painel/check-in-membros/`.
      `specs/010-checkin-membros/`. D7 esclarecido durante a spec: a modalidade é do
      **candidato**, não do membro — `task.md`/`CONTEXT.md` amarravam os dois por engano.
      Mesclada em `develop` via PR #10.
- [x] **FEAT-0012** — Organização automática de grupos: admin aciona "organizar grupos" na
      edição corrente, o sistema distribui candidatos presenciais presentes entre salas
      (D5, via `deriveRoomCapacity`) e aloca avaliadores/hosts com check-in de membro feito;
      nunca deixa um grupo com exatamente 1 mulher (D1); candidatos online (D7) formam
      grupos próprios, separados dos presenciais, sem sala nem avaliador alocado
      automaticamente (decisão tomada durante a spec — ver `specs/012-organizacao-grupos/spec.md`,
      US3). Ajuste manual pós-organização (mover candidato/avaliador entre grupos), com
      aviso — não bloqueio — para violação de D1. Migration `0014` reconstrói
      `groups`/`group_evaluators`/`group_candidates` (órfãs desde a `0001`, ganham
      `process_id`, `room_id` nullable, `modality`). `specs/012-organizacao-grupos/`.
      `front/app/painel/grupos/`. Implementada na branch `claude/feat-0012-organizacao-grupos`,
      ainda não mesclada em `develop` no momento desta nota.

Todas as features acima, **exceto a FEAT-0012**, estão **mescladas em `develop`**
(2026-08-26), com a suíte completa passando (366 testes `api`, 20 `shared`, `tsc`/build
limpos em `shared`/`api`/`front`). **Migrations `0008` a `0013` aplicadas só localmente** —
staging e produção pendentes (ver "Pendências operacionais").

**FEAT-0012 implementada na branch `claude/feat-0012-organizacao-grupos`** (ainda não
mesclada em `develop` no momento desta nota) — 405 testes `api` passando (39 novos: 15 do
algoritmo puro D1/D5, 12 de service com D1 real, 12 de rota HTTP), 20 `shared`, `tsc`/build
limpos em `shared`/`api`/`front`. Migration `0014` só local. **Achado durante a
implementação**: `GroupCandidate` não expõe `gender` na resposta HTTP — mesma postura de
`CandidateCheckinItemSchema` (FEAT-0005): dado sensível de inscrição, nunca por pessoa numa
listagem comum; D1 é verificado só no backend, uma violação chega ao front como o aviso
`GENDER_RULE_VIOLATED`, sem identificar quem.

## Convenção: quando pular o ciclo do spec-kit

Tarefas pequenas (um botão, um ajuste pontual, sem schema/migration novos ou com extensão
óbvia de um contrato existente) não passam por `/speckit.specify → plan → tasks → analyze` —
implementar direto e documentar de forma leve (comentário no código, uma linha aqui). O ciclo
completo é reservado para features relevantes de verdade.

## Backlog 008–016 — cadeia ainda não fechada

Decisões D1–D7 e o diagrama de dependência completo estão em `CONTEXT.md`. Resumo do que falta:

- [ ] **FEAT-0013** — Avaliação dos candidatos (5 critérios ponderados, veredito por veto de
      vermelho — D2). Depende da 012 (feita — ver "Concluído" acima). Reconstrói
      `evaluations`/`metrics` (mesma janela órfã das tabelas de grupo).

## Órfãos — sem spec, sem dono

- [ ] **Tela de logs do admin via webhook** (item 3 da FEAT-0006 original). O dado já é
      gravado desde a FEAT-0005 (`checkin_events`, append-only). Falta a tela e o webhook.
      Não entrou no backlog 008–016 — fica aqui para não sumir de novo.
- [ ] CRUD de processos seletivos.
- [ ] Contador "X de Y presentes" no cabeçalho do check-in.
- [ ] Dark mode.
- [ ] Duas telas de estado no Stitch: "nenhum candidato inscrito" e "sem processo corrente".
- [ ] UI para incluir gênero/etnia na exportação CSV (`include_sensitive=true`) — a FEAT-0016
      implementou o endpoint e o botão padrão (sempre `false`); um botão dedicado a dado
      sensível fica para quando houver pedido real.

## Pendências operacionais (não são código)

- [ ] Aplicar migrations `0008` a `0014` em staging, depois produção (staging sempre primeiro
      — Princípio III da constitution). Migration `0014` reconstrói `groups`/`group_evaluators`/
      `group_candidates` — confirmar que seguem vazias nesses ambientes antes de aplicar
      (research.md D-tech1 da FEAT-0012).
- [ ] Calibrar as iterações do PBKDF2 (FEAT-0003) medindo CPU em produção — `wrangler dev`
      não aplica o teto de 10 ms.
- [ ] Criar a regra de Rate Limiting do WAF em `/auth/*` (FEAT-0003) — o plano Free só dá
      **uma** regra; decidir onde ela é mais necessária antes de gastá-la.
- [ ] Conferir `wrangler secret list` em `api`/`api-staging` antes de qualquer novo secret —
      histórico de secrets órfãos no projeto (`RESEND_API_KEY`, `PENDING_REGISTRATIONS`).
