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
      Implementada na branch `feat/papel-host`, ainda não mesclada em `develop`.

Features 008 e 011 estão mescladas em `develop`. A 009 está implementada e testada
(287 testes passando, quickstart validado manualmente contra `wrangler dev` local) mas segue
na própria branch — sem merge automático, mesmo padrão de 008/011. **Migrations `0008`, `0009`
e `0010` aplicadas só localmente** — staging e produção pendentes (ver "Pendências operacionais").

## Backlog 008–016 — cadeia ainda não fechada

Decisões D1–D7 e o diagrama de dependência completo estão em `CONTEXT.md`. Resumo do que falta:

- [ ] **FEAT-0010** — Check-in de membros (avaliadores/hosts) + sessão online para quem tem
      restrição de sábado (D7). Depende da 009 (feita, aguardando merge).
- [ ] **FEAT-0012** — Organização automática de grupos. Depende de 009, 010 e 011 (feita).
      Reconstrói `groups`/`group_evaluators`/`group_candidates` (hoje vazias e órfãs desde a
      `0001`) — `DROP`/`CREATE` trivial agora, procedimento perigoso depois de povoadas.
- [ ] **FEAT-0013** — Avaliação dos candidatos (5 critérios ponderados, veredito por veto de
      vermelho — D2). Depende da 012. Reconstrói `evaluations`/`metrics` (mesma janela acima).
- [ ] **FEAT-0014** — Necessidades especiais: campo de descrição condicional ao boolean
      existente. Independente.
- [ ] **FEAT-0015** — Filtro por curso no painel, check-in e dashboard. Independente.
- [ ] **FEAT-0016** — Exportação de candidatos em planilha (CSV — não XLSX, orçamento de CPU),
      admin-only, com campos sensíveis marcados e log de quem exportou. Independente.

## Órfãos — sem spec, sem dono

- [ ] **Tela de logs do admin via webhook** (item 3 da FEAT-0006 original). O dado já é
      gravado desde a FEAT-0005 (`checkin_events`, append-only). Falta a tela e o webhook.
      Não entrou no backlog 008–016 — fica aqui para não sumir de novo.
- [ ] CRUD de processos seletivos.
- [ ] Contador "X de Y presentes" no cabeçalho do check-in.
- [ ] Dark mode.
- [ ] Duas telas de estado no Stitch: "nenhum candidato inscrito" e "sem processo corrente".

## Pendências operacionais (não são código)

- [ ] Aplicar migrations `0008`, `0009` e `0010` em staging, depois produção (staging sempre
      primeiro — Princípio III da constitution).
- [ ] Mesclar `feat/papel-host` (FEAT-0009) em `develop`.
- [ ] Calibrar as iterações do PBKDF2 (FEAT-0003) medindo CPU em produção — `wrangler dev`
      não aplica o teto de 10 ms.
- [ ] Criar a regra de Rate Limiting do WAF em `/auth/*` (FEAT-0003) — o plano Free só dá
      **uma** regra; decidir onde ela é mais necessária antes de gastá-la.
- [ ] Conferir `wrangler secret list` em `api`/`api-staging` antes de qualquer novo secret —
      histórico de secrets órfãos no projeto (`RESEND_API_KEY`, `PENDING_REGISTRATIONS`).
