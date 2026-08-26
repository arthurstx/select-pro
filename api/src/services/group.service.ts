import type { GroupSummary } from "shared";

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
import type { GroupRepository, GroupRow } from "../repositories/group.repository";
import { organizeGroups } from "./group-organization";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

type OrganizeResult = { groups: GroupSummary[]; unallocatedCandidateCount: number };
type MoveResult = { groups: [GroupSummary, GroupSummary]; warning: "GENDER_RULE_VIOLATED" | null };

export type OrganizeError = NoActiveSelectionProcessError | NoCandidatesPresentError | NoRoomsAvailableError;
export type ListError = NoActiveSelectionProcessError;
export type MoveError =
    | NoActiveSelectionProcessError
    | GroupNotFoundError
    | CandidateNotAllocatedError
    | EvaluatorNotAllocatedError
    | GroupModalityMismatchError;

/** Orquestra `GroupRepository` + o algoritmo puro de `group-organization.ts` (FEAT-0012). */
export class GroupService {
    constructor(
        private readonly repository: GroupRepository,
        private readonly processes: SelectionProcessRepository,
    ) {}

    /** FR-001/FR-002/FR-011/FR-012/FR-013. */
    async organize(now: Date = new Date()): Promise<Either<OrganizeError, OrganizeResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const [candidates, rooms, presentMembers] = await Promise.all([
            this.repository.listPresentCandidates(process.id),
            this.repository.listRoomsOrdered(),
            this.repository.listPresentMembers(process.id),
        ]);

        if (candidates.length === 0) {
            return left(new NoCandidatesPresentError());
        }

        const hasPresencial = candidates.some((c) => c.attendance === "presencial");
        if (hasPresencial && rooms.length === 0) {
            return left(new NoRoomsAvailableError());
        }

        const { groups, unallocatedCandidateCount } = organizeGroups({ candidates, rooms, presentMembers });

        await this.repository.replaceOrganization(process.id, groups);

        logger.info("group.organize.completed", {
            processId: process.id,
            groupCount: groups.length,
            unallocatedCandidateCount,
        });

        return right({ groups: await this.buildSummaries(process.id), unallocatedCandidateCount });
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

    /** FR-009 — mesmo contrato, para avaliador/host. `warning` é sempre `null` (D1 é sobre candidatos). */
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

    // ------------------------------------------------------------

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

function toSummary(
    group: GroupRow,
    candidateAllocations: { group_id: string; candidate_id: string; name: string; attendance: "online" | "presencial" }[],
    evaluatorAllocations: { group_id: string; user_id: string; name: string; role: "avaliador" | "host" }[],
): GroupSummary {
    return {
        id: group.id,
        name: group.name,
        modality: group.modality,
        room: group.room_id && group.room_name ? { id: group.room_id, name: group.room_name } : null,
        candidates: candidateAllocations
            .filter((c) => c.group_id === group.id)
            .map((c) => ({ id: c.candidate_id, name: c.name, attendance: c.attendance })),
        evaluators: evaluatorAllocations
            .filter((e) => e.group_id === group.id)
            .map((e) => ({ userId: e.user_id, name: e.name, role: e.role })),
    };
}
