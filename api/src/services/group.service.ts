import type { AvailableEvaluator, GroupSummary, RoomRow } from "shared";

import { type Either, left, right } from "../core/either";
import { NoActiveSelectionProcessError } from "../core/errors/checkin-errors";
import {
    CandidateNotAllocatedError,
    EvaluatorNotAllocatedError,
    GroupModalityMismatchError,
    GroupNotFoundError,
    NoCandidatesPresentError,
    NoRoomsAvailableError,
} from "../core/errors/group-errors";
import { logger } from "../lib/logger";
import type {
    GroupCandidateAllocationRow,
    GroupEvaluatorAllocationRow,
    GroupRepository,
    GroupRow,
    GroupToInsert,
    PresentCandidateRow,
    PresentMemberRow,
} from "../repositories/group.repository";
import { organizeOnlineGroups, organizePresencialGroups } from "./group-organization";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

type OrganizeResult = { groups: GroupSummary[]; unallocatedCandidateCount: number };
type MoveResult = { groups: [GroupSummary, GroupSummary]; warning: "GENDER_RULE_VIOLATED" | null };

export type OrganizePresencialError = NoActiveSelectionProcessError | NoCandidatesPresentError | NoRoomsAvailableError;
export type OrganizeOnlineError = NoActiveSelectionProcessError | NoCandidatesPresentError;
export type ListError = NoActiveSelectionProcessError;
export type MoveError =
    | NoActiveSelectionProcessError
    | GroupNotFoundError
    | CandidateNotAllocatedError
    | EvaluatorNotAllocatedError
    | GroupModalityMismatchError;
export type AssignEvaluatorError = NoActiveSelectionProcessError | GroupNotFoundError | GroupModalityMismatchError;
export type LeaveOnlineGroupError = NoActiveSelectionProcessError | EvaluatorNotAllocatedError;

/**
 * Orquestra `GroupRepository` + o algoritmo puro de `group-organization.ts` (FEAT-0012).
 * FEAT-0018: presencial e online são operações independentes (dias diferentes, pessoas
 * diferentes) — `organizePresencial`/`organizeOnline` nunca se tocam, e o vínculo
 * avaliador↔grupo online nasce só por `assignEvaluatorToOnlineGroup`/`leaveOnlineGroup`
 * (ação humana), nunca pela organização em si.
 */
export class GroupService {
    constructor(
        private readonly repository: GroupRepository,
        private readonly processes: SelectionProcessRepository,
    ) {}

    /**
     * FR-004/FR-005/FR-006/FR-013 (FEAT-0012) — só afeta grupos `modality: "presencial"`.
     * `evaluatorUserIds` (FEAT-0021): quando informado, só esses avaliadores entram no
     * cálculo de avaliador-por-grupo — ausente = todos os avaliadores presentes (comportamento
     * de antes da feature). Hosts presentes continuam sempre completos (research.md, Decisão
     * 4). Passar o MESMO `evaluatorUserIds` usado em `previewPresencial` reproduz exatamente a
     * prévia (FR-011) — o algoritmo é determinístico dado o mesmo conjunto de entrada.
     */
    async organizePresencial(
        evaluatorUserIds?: string[],
        now: Date = new Date(),
    ): Promise<Either<OrganizePresencialError, OrganizeResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const inputsResult = await this.loadPresencialInputs(process.id, evaluatorUserIds);
        if (inputsResult.isLeft()) return left(inputsResult.value);
        const { candidates, rooms, members } = inputsResult.value;

        const { groups, unallocatedCandidateCount } = organizePresencialGroups(candidates, rooms, members);

        await this.repository.replaceOrganization(process.id, "presencial", groups);

        logger.info("group.organize_presencial.completed", {
            processId: process.id,
            groupCount: groups.length,
            unallocatedCandidateCount,
        });

        // Só os grupos presenciais — a resposta reflete o que ESTA operação organizou, não a
        // edição inteira (que pode ter grupos online de uma organização independente, FEAT-0018).
        const summaries = (await this.buildSummaries(process.id)).filter((g) => g.modality === "presencial");
        return right({ groups: summaries, unallocatedCandidateCount });
    }

    /**
     * FEAT-0021 (FR-005 a FR-010) — mesmo cálculo de `organizePresencial`, SEM persistir nada
     * (nunca chama `replaceOrganization`). `groups[].id` é gerado na hora, só pra servir de
     * `key` de lista no front — não existe no banco. `availableEvaluators` lista TODOS os
     * avaliadores/hosts presentes (não só os selecionados), pro front montar o seletor.
     */
    async previewPresencial(
        evaluatorUserIds?: string[],
        now: Date = new Date(),
    ): Promise<
        Either<OrganizePresencialError, OrganizeResult & { availableEvaluators: AvailableEvaluator[] }>
    > {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const inputsResult = await this.loadPresencialInputs(process.id, evaluatorUserIds);
        if (inputsResult.isLeft()) return left(inputsResult.value);
        const { candidates, rooms, members, allPresentMembers } = inputsResult.value;

        const { groups, unallocatedCandidateCount } = organizePresencialGroups(candidates, rooms, members);

        const candidateById = new Map(candidates.map((c) => [c.id, c] as const));
        const memberById = new Map(allPresentMembers.map((m) => [m.user_id, m] as const));
        const roomById = new Map(rooms.map((r) => [r.id, r] as const));

        const summaries = groups.map((group) => toPreviewSummary(group, roomById, candidateById, memberById));
        const availableEvaluators: AvailableEvaluator[] = allPresentMembers.map((m) => ({
            userId: m.user_id,
            name: m.name,
            memberStatus: m.memberStatus,
            role: m.role,
        }));

        return right({ groups: summaries, unallocatedCandidateCount, availableEvaluators });
    }

    /** FEAT-0021 (FR-001) — remove toda a organização presencial da edição; nunca afeta online. */
    async clearPresencialOrganization(now: Date = new Date()): Promise<Either<NoActiveSelectionProcessError, void>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        await this.repository.replaceOrganization(process.id, "presencial", []);

        logger.info("group.clear_presencial.completed", { processId: process.id });

        return right(undefined);
    }

    /** FEAT-0022 — mesmo conceito de `clearPresencialOrganization`, para o online; nunca afeta presencial. */
    async clearOnlineOrganization(now: Date = new Date()): Promise<Either<NoActiveSelectionProcessError, void>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        await this.repository.replaceOrganization(process.id, "online", []);

        logger.info("group.clear_online.completed", { processId: process.id });

        return right(undefined);
    }

    /** FR-001/FR-002 (FEAT-0018) — só separa candidatos online em grupos; nunca sala/avaliador/host. */
    async organizeOnline(now: Date = new Date()): Promise<Either<OrganizeOnlineError, OrganizeResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const candidates = await this.loadPresentOnlineCandidates(process.id);
        if (candidates.length === 0) {
            return left(new NoCandidatesPresentError());
        }

        const groups = organizeOnlineGroups(candidates);

        await this.repository.replaceOrganization(process.id, "online", groups);

        logger.info("group.organize_online.completed", { processId: process.id, groupCount: groups.length });

        const summaries = (await this.buildSummaries(process.id)).filter((g) => g.modality === "online");
        return right({ groups: summaries, unallocatedCandidateCount: 0 });
    }

    /**
     * FEAT-0022 (US4) — mesmo cálculo de `organizeOnline`, SEM persistir nada (nunca chama
     * `replaceOrganization`). Avaliador nunca entra no cálculo automático do online (FR-015) —
     * `evaluators` sai sempre `[]`; sem `room` (online nunca teve sala) e sem
     * `unallocatedCandidateCount` (o algoritmo online sempre aloca todo mundo).
     */
    async previewOnline(now: Date = new Date()): Promise<Either<OrganizeOnlineError, { groups: GroupSummary[] }>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const candidates = await this.loadPresentOnlineCandidates(process.id);
        if (candidates.length === 0) {
            return left(new NoCandidatesPresentError());
        }

        const groups = organizeOnlineGroups(candidates);
        const candidateById = new Map(candidates.map((c) => [c.id, c] as const));
        const summaries = groups.map((group) => toPreviewSummary(group, new Map(), candidateById, new Map()));

        return right({ groups: summaries });
    }

    /** FR-008 — lê a organização já persistida, sem recalcular. */
    async list(now: Date = new Date()): Promise<Either<ListError, GroupSummary[]>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);

        return right(await this.buildSummaries(processResult.value.id));
    }

    /** FR-009/FR-010 — move um candidato, bloqueia mistura de modalidade (FR-003), avisa (sem bloquear) violação de D1. */
    async moveCandidate(candidateId: string, toGroupId: string, now: Date = new Date()): Promise<Either<MoveError, MoveResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const toGroup = await this.repository.findGroupById(toGroupId, process.id);
        if (!toGroup) return left(new GroupNotFoundError());

        const fromGroup = await this.repository.findCandidateGroup(candidateId, process.id);
        if (!fromGroup) return left(new CandidateNotAllocatedError());

        if (fromGroup.modality !== toGroup.modality) return left(new GroupModalityMismatchError());

        await this.repository.moveCandidate(candidateId, toGroupId);

        const warning = await this.genderWarning([fromGroup.id, toGroup.id]);
        const groups = await Promise.all([this.buildSummary(fromGroup.id), this.buildSummary(toGroup.id)]);

        return right({ groups, warning });
    }

    /**
     * FR-009 — move um avaliador/host JÁ ALOCADO para outro grupo. Continua exigindo que ele
     * já esteja em algum grupo (`EvaluatorNotAllocatedError` se não estiver) — para a primeira
     * alocação a um grupo online, ver `assignEvaluatorToOnlineGroup` (FEAT-0018).
     */
    async moveEvaluator(userId: string, toGroupId: string, now: Date = new Date()): Promise<Either<MoveError, MoveResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const toGroup = await this.repository.findGroupById(toGroupId, process.id);
        if (!toGroup) return left(new GroupNotFoundError());

        const fromGroup = await this.repository.findEvaluatorGroup(userId, process.id);
        if (!fromGroup) return left(new EvaluatorNotAllocatedError());

        if (fromGroup.modality !== toGroup.modality) return left(new GroupModalityMismatchError());

        await this.repository.moveEvaluator(userId, toGroupId);

        const groups = await Promise.all([this.buildSummary(fromGroup.id), this.buildSummary(toGroup.id)]);

        return right({ groups, warning: null });
    }

    /**
     * FEAT-0018 (FR-003/FR-004/FR-006) — alocação de avaliador a um grupo ONLINE, por ação
     * humana: self-service (`userId` = o próprio autenticado) ou atribuição manual do admin
     * (`userId` explícito). Diferente de `moveEvaluator`: não exige grupo de origem — o
     * `UNIQUE(user_id)` de `group_evaluators` cobre "mover de onde estava" via `ON CONFLICT`
     * (research.md, Decisão 3), então funciona tanto pra primeira entrada quanto pra trocar de
     * grupo. Devolve só o grupo de destino — pode não ter existido grupo de origem.
     */
    async assignEvaluatorToOnlineGroup(
        userId: string,
        groupId: string,
        now: Date = new Date(),
    ): Promise<Either<AssignEvaluatorError, GroupSummary>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const group = await this.repository.findGroupById(groupId, process.id);
        if (!group) return left(new GroupNotFoundError());
        if (group.modality !== "online") return left(new GroupModalityMismatchError());

        await this.repository.assignEvaluator(userId, groupId);

        logger.info("group.assign_evaluator_online.success", { processId: process.id, groupId, userId });

        return right(await this.buildSummary(groupId));
    }

    /** FEAT-0018 (FR-005) — avaliador sai do grupo online em que estiver. */
    async leaveOnlineGroup(userId: string, now: Date = new Date()): Promise<Either<LeaveOnlineGroupError, void>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const group = await this.repository.findEvaluatorGroup(userId, process.id);
        if (!group || group.modality !== "online") return left(new EvaluatorNotAllocatedError());

        await this.repository.removeEvaluator(userId);

        logger.info("group.leave_online_group.success", { processId: process.id, userId });

        return right(undefined);
    }

    // ------------------------------------------------------------

    /** FEAT-0022 — carrega os candidatos online presentes, compartilhado por `organizeOnline`/`previewOnline`. */
    private async loadPresentOnlineCandidates(processId: string): Promise<PresentCandidateRow[]> {
        const allCandidates = await this.repository.listPresentCandidates(processId);
        return allCandidates.filter((c) => c.attendance === "online");
    }

    /**
     * FEAT-0021 — carrega as "fotos" de entrada compartilhadas por `organizePresencial` e
     * `previewPresencial`, já filtrando `members` por `evaluatorUserIds` quando informado
     * (hosts sempre completos — research.md, Decisão 4). `allPresentMembers` (sem filtro)
     * volta separado, pra `previewPresencial` montar `availableEvaluators` com todo mundo.
     */
    private async loadPresencialInputs(
        processId: string,
        evaluatorUserIds: string[] | undefined,
    ): Promise<
        Either<
            NoCandidatesPresentError | NoRoomsAvailableError,
            { candidates: PresentCandidateRow[]; rooms: RoomRow[]; members: PresentMemberRow[]; allPresentMembers: PresentMemberRow[] }
        >
    > {
        const [allCandidates, rooms, allPresentMembers] = await Promise.all([
            this.repository.listPresentCandidates(processId),
            this.repository.listRoomsOrdered(),
            this.repository.listPresentMembers(processId),
        ]);
        const candidates = allCandidates.filter((c) => c.attendance === "presencial");

        if (candidates.length === 0) {
            return left(new NoCandidatesPresentError());
        }
        if (rooms.length === 0) {
            return left(new NoRoomsAvailableError());
        }

        const selected = evaluatorUserIds ? new Set(evaluatorUserIds) : null;
        const members = selected
            ? allPresentMembers.filter((m) => m.role === "host" || selected.has(m.user_id))
            : allPresentMembers;

        return right({ candidates, rooms, members, allPresentMembers });
    }

    /** Mesmo padrão de `checkin.service.ts`/`member-checkin.service.ts` — `resolveCurrent()` não deveria lançar, mas a guarda existe. */
    private async resolveCurrentProcess(now: Date): Promise<Either<NoActiveSelectionProcessError, { id: string }>> {
        try {
            const process = await this.processes.resolveCurrent(now);
            return right(process);
        } catch (err) {
            logger.error("group.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }

    private async genderWarning(groupIds: string[]): Promise<"GENDER_RULE_VIOLATED" | null> {
        const counts = await Promise.all(groupIds.map((id) => this.repository.countWomenInGroup(id)));
        return counts.some((count) => count === 1) ? "GENDER_RULE_VIOLATED" : null;
    }

    private async buildSummaries(processId: string): Promise<GroupSummary[]> {
        const [groups, candidateAllocations, evaluatorAllocations] = await Promise.all([
            this.repository.listGroups(processId),
            this.repository.listCandidateAllocations(processId),
            this.repository.listEvaluatorAllocations(processId),
        ]);

        return groups.map((group) => toSummary(group, candidateAllocations, evaluatorAllocations));
    }

    /** Sem checagem de posse aqui — quem chama já validou o grupo via `findGroupById`/`findCandidateGroup` antes. */
    private async buildSummary(groupId: string): Promise<GroupSummary> {
        const [group, candidateAllocations, evaluatorAllocations] = await Promise.all([
            this.repository.getGroupRow(groupId),
            this.repository.listCandidateAllocationsForGroup(groupId),
            this.repository.listEvaluatorAllocationsForGroup(groupId),
        ]);

        // Sempre existe: quem chama acabou de confirmar o grupo (`findGroupById` etc.).
        return toSummary(group!, candidateAllocations, evaluatorAllocations);
    }
}

/**
 * FEAT-0021 — monta um `GroupSummary` a partir da saída do algoritmo puro (`GroupToInsert`),
 * SEM ler o banco (nada foi persistido) — usa os mapas já carregados em memória por
 * `previewPresencial`. `role`/`memberStatus` do avaliador vêm direto do `PresentMemberRow`
 * (a mesma derivação host-por-sala já aconteceu dentro de `organizePresencialGroups`, então
 * `role` aqui é só "esta pessoa tem edition_hosts?" — replicado da leitura real via `role` já
 * calculado por `listPresentMembers`).
 */
function toPreviewSummary(
    group: GroupToInsert,
    roomById: Map<string, RoomRow>,
    candidateById: Map<string, PresentCandidateRow>,
    memberById: Map<string, PresentMemberRow>,
): GroupSummary {
    const room = group.roomId ? roomById.get(group.roomId) : undefined;

    return {
        id: group.id,
        name: group.name,
        modality: group.modality,
        room: room ? { id: room.id, name: room.name, type: room.type } : null,
        candidates: group.candidateIds.flatMap((id) => {
            const candidate = candidateById.get(id);
            return candidate ? [{ id: candidate.id, name: candidate.name, attendance: candidate.attendance, gender: candidate.gender }] : [];
        }),
        evaluators: group.evaluatorUserIds.flatMap((id) => {
            const member = memberById.get(id);
            return member ? [{ userId: member.user_id, name: member.name, role: member.role, memberStatus: member.memberStatus }] : [];
        }),
    };
}

function toSummary(
    group: GroupRow,
    candidateAllocations: GroupCandidateAllocationRow[],
    evaluatorAllocations: GroupEvaluatorAllocationRow[],
): GroupSummary {
    return {
        id: group.id,
        name: group.name,
        modality: group.modality,
        room:
            group.room_id && group.room_name !== null && group.room_type !== null
                ? { id: group.room_id, name: group.room_name, type: group.room_type }
                : null,
        candidates: candidateAllocations
            .filter((c) => c.group_id === group.id)
            .map((c) => ({ id: c.candidate_id, name: c.name, attendance: c.attendance, gender: c.gender })),
        evaluators: evaluatorAllocations
            .filter((e) => e.group_id === group.id)
            .map((e) => ({ userId: e.user_id, name: e.name, role: e.role, memberStatus: e.memberStatus })),
    };
}
