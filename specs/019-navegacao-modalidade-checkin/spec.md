# Feature Specification: Navegação por modalidade + check-in dividido

**Feature Branch**: `019-navegacao-modalidade-checkin`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Reorganizar a navegação em dois grupos de topo, 'Presencial' e 'Online', cada um com Grupos + Check-in da própria modalidade. O check-in de candidatos precisa virar duas telas de verdade (uma só presencial, outra só online), não só reorganização de links."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin faz check-in só dos candidatos de uma modalidade (Priority: P1)

O admin (ou quem faz check-in na entrada do evento) abre a tela de check-in do dia — por
exemplo, num sábado de prova presencial — e vê só os candidatos presenciais, sem precisar
identificar visualmente quem é online no meio da lista inteira. No dia do prosel online, a
mesma pessoa abre outra tela e vê só os candidatos online.

**Why this priority**: É o motivo inteiro da feature — hoje a lista mistura as duas
modalidades, e quem faz check-in numa fila de evento não quer filtrar manualmente cada vez.

**Independent Test**: Abrir a tela de check-in presencial com candidatos das duas
modalidades cadastrados — só os presenciais aparecem, contados no cabeçalho. Repetir na tela
online — só os online aparecem.

**Acceptance Scenarios**:

1. **Given** candidatos presenciais e online com check-in feito, **When** o admin abre a tela
   de check-in presencial, **Then** só os candidatos presenciais aparecem na lista, e o
   contador do cabeçalho reflete só esse recorte.
2. **Given** a mesma situação, **When** o admin abre a tela de check-in online, **Then** só os
   candidatos online aparecem.
3. **Given** a tela de check-in de uma modalidade, **When** o admin usa busca por nome, filtro
   de status (presentes/ausentes) ou filtro de curso, **Then** os filtros funcionam
   normalmente, sempre dentro do recorte da modalidade da tela — nunca misturando com a outra.

---

### User Story 2 - Navegação organizada por modalidade (Priority: P2)

Ao abrir o painel, o admin/avaliador vê a navegação organizada em dois grupos — "Presencial"
e "Online" — cada um levando a Grupos e Check-in da própria modalidade, em vez de itens
soltos misturando os dois contextos.

**Why this priority**: Suporte à US1 e à navegação de grupos já existente (FEAT-0018) — sem
isso, as telas novas existem mas ficam sem um caminho claro de acesso.

**Independent Test**: Abrir o painel e conferir que a navegação mostra "Presencial"
(expandindo para Grupos Presenciais + Check-in Presencial) e "Online" (expandindo para Grupos
Online + Check-in Online), com os demais itens do menu continuando soltos.

**Acceptance Scenarios**:

1. **Given** o painel aberto, **When** o admin expande "Presencial", **Then** vê "Grupos
   Presenciais" e "Check-in Presencial", cada um levando à tela correspondente.
2. **Given** o painel aberto, **When** o admin expande "Online", **Then** vê "Grupos Online" e
   "Check-in Online".
3. **Given** um link direto para a antiga tela única de check-in, **When** alguém o abre,
   **Then** cai automaticamente na tela de check-in presencial (link antigo continua
   funcionando, só redireciona).

---

### Edge Cases

- Um candidato sem nenhum dado de disponibilidade de sábado (`candidate_applications`
  ausente): conta como presencial, mesmo comportamento já usado hoje em qualquer lugar que
  deriva essa modalidade (ausência de restrição = presencial).
- Check-in de membros (avaliadores/hosts) não muda — continua sendo uma tela só, fora dos
  dois grupos novos, já que não é dividido por modalidade.
- Os outros itens do menu (Painel, Solicitações, Salas, Avaliadores, Check-in de Membros,
  Minhas Avaliações, Avaliações, Processos seletivos) continuam fora dos grupos Presencial/
  Online — não são específicos de uma modalidade.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir listar candidatos filtrados por modalidade
  (presencial ou online) numa consulta de check-in.
- **FR-002**: DEVE existir uma tela de check-in que mostra só candidatos presenciais.
- **FR-003**: DEVE existir uma tela de check-in que mostra só candidatos online.
- **FR-004**: As duas telas de check-in por modalidade DEVEM manter toda a funcionalidade já
  existente na tela única de hoje (busca por nome, filtro de presença, filtro de curso,
  paginação, marcar/desmarcar presença), aplicada dentro do recorte da própria modalidade.
- **FR-005**: Um acesso à URL antiga da tela de check-in único DEVE continuar funcionando,
  levando à tela de check-in presencial.
- **FR-006**: A navegação do painel DEVE apresentar "Presencial" e "Online" como agrupadores
  de topo, cada um contendo o acesso aos Grupos e ao Check-in da própria modalidade.
- **FR-007**: Os itens de navegação que não são específicos de uma modalidade DEVEM
  continuar acessíveis fora desses dois agrupadores.

### Key Entities

- **Candidato (check-in)**: entidade já existente. Nenhum campo novo — a modalidade já é
  derivada da restrição de sábado da inscrição (D7), só passa a ser usada como filtro de
  consulta, além de exibição.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin abrindo a tela de check-in de uma modalidade vê 100% dos candidatos
  dessa modalidade e 0% da outra, em qualquer combinação de busca/status/curso.
- **SC-002**: Um admin localiza a tela de check-in da modalidade certa em no máximo 2 cliques
  a partir de qualquer tela do painel.
- **SC-003**: Nenhum link ou favorito existente para a tela de check-in antiga deixa de
  funcionar.

## Assumptions

- A regra de derivação de modalidade (D7 — `saturday_restriction` da inscrição) não muda;
  esta feature só passa a usá-la também como filtro de consulta, não só de exibição.
- Check-in de membros (FEAT-0010) fica fora de escopo — continua uma tela só.
- Sem mudança de permissão/autorização — as telas novas herdam exatamente o mesmo controle de
  acesso da tela única de hoje.
