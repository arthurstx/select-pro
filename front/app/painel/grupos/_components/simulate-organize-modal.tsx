"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalculatorIcon, SearchIcon, UsersRoundIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  calculateHostDeficit,
  classifyPresencialGroup,
  deriveEvaluatorTargetForGroupSize,
  deriveRoomCapacity,
  derivePresencialGroupCount,
  recommendRoomsForGroups,
  type AvailableEvaluator,
  type GroupSummary,
} from "shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { setEvaluatorRole } from "@/lib/evaluators/evaluators-api";
import {
  useMoveCandidateMutation,
  useMoveEvaluatorMutation,
  useOrganizePresencialMutation,
  usePreviewPresencialMutation,
} from "@/lib/group/queries";

import { GenderBadge } from "./gender-badge";
import { MemberName } from "./member-name";

/**
 * FEAT-0021 (US1) — substitui o antigo botão direto "Organizar grupos" (presencial). Fluxo:
 * abrir → prévia calculada na hora (sem persistir nada, FR-010) → gestão ajusta quem
 * participa/promove a host/move candidato ou avaliador entre salas na prévia → só "Aprovar
 * simulação e organizar grupos" grava de verdade (FEAT-0022 — organiza com a MESMA seleção da
 * última prévia do servidor e depois replica os ajustes manuais de posição via `moveCandidate`/
 * `moveEvaluator`, ver `reconcileManualMoves`).
 */
export function SimulateOrganizeModal() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(null);
  /** FEAT-0022 — cópia local editável da última prévia do servidor; só ela reflete os moves manuais (item 4). */
  const [localGroups, setLocalGroups] = useState<GroupSummary[] | null>(null);

  const preview = usePreviewPresencialMutation();
  const organize = useOrganizePresencialMutation();
  const moveCandidate = useMoveCandidateMutation();
  const moveEvaluator = useMoveEvaluatorMutation();
  const queryClient = useQueryClient();

  const promote = useMutation({
    mutationFn: (userId: string) => setEvaluatorRole(userId, "host"),
    onError: () => toast.error("Não foi possível promover este avaliador a host."),
  });
  const demote = useMutation({
    mutationFn: (userId: string) => setEvaluatorRole(userId, "avaliador"),
    onError: () => toast.error("Não foi possível rebaixar este host a avaliador."),
  });

  function runPreview(evaluatorUserIds: string[]) {
    preview.mutate(evaluatorUserIds, {
      onSuccess: (data) => {
        // Só avaliadores entram na seleção — hosts são sempre usados automaticamente (research.md, Decisão 4).
        const avaliadorIds = data.availableEvaluators.filter((e) => e.role === "avaliador").map((e) => e.userId);
        setSelected(new Set(avaliadorIds.filter((id) => evaluatorUserIds.includes(id))));
        // Novo cálculo do servidor sempre substitui qualquer move manual anterior — mudou quem
        // participa, os slots recalculados não têm mais relação com o que foi arrastado antes.
        setLocalGroups(data.groups);
      },
      onError: () => toast.error("Não foi possível calcular a simulação."),
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSearch("");
      // Primeira simulação da sessão: todos os avaliadores presentes participam por padrão.
      preview.mutate(undefined, {
        onSuccess: (data) => {
          const avaliadorIds = data.availableEvaluators.filter((e) => e.role === "avaliador").map((e) => e.userId);
          setSelected(new Set(avaliadorIds));
          setLocalGroups(data.groups);
        },
        onError: () => toast.error("Não foi possível calcular a simulação."),
      });
    } else {
      setSelected(null);
      setLocalGroups(null);
    }
  }

  function toggleEvaluator(userId: string) {
    if (!selected) return;
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    runPreview(Array.from(next));
  }

  async function handlePromote(userId: string) {
    await promote.mutateAsync(userId);
    if (selected) {
      const next = new Set(selected);
      next.delete(userId); // virou host — sai do pool de avaliador
      runPreview(Array.from(next));
    }
  }

  async function handleDemote(userId: string) {
    await demote.mutateAsync(userId);
    if (selected) {
      const next = new Set(selected);
      next.add(userId); // volta a ser avaliador — participa por padrão
      runPreview(Array.from(next));
    }
  }

  /**
   * FEAT-0022 (item 4) — mover é só local, nunca chama a API: a prévia inteira (contagens por
   * sala incluídas) reajusta na hora a partir desse novo arranjo. Host fica de fora do move —
   * é recurso da SALA inteira (replicado em todo grupo dela), não faz sentido "morar" num
   * grupo específico dentro da prévia.
   */
  function moveCandidateLocal(candidateId: string, fromGroupId: string, toGroupId: string) {
    setLocalGroups((prev) => {
      if (!prev) return prev;
      const candidate = prev.find((g) => g.id === fromGroupId)?.candidates.find((c) => c.id === candidateId);
      if (!candidate) return prev;
      return prev.map((g) => {
        if (g.id === fromGroupId) return { ...g, candidates: g.candidates.filter((c) => c.id !== candidateId) };
        if (g.id === toGroupId) return { ...g, candidates: [...g.candidates, candidate] };
        return g;
      });
    });
  }

  function moveEvaluatorLocal(userId: string, fromGroupId: string, toGroupId: string) {
    setLocalGroups((prev) => {
      if (!prev) return prev;
      const evaluator = prev.find((g) => g.id === fromGroupId)?.evaluators.find((e) => e.userId === userId);
      if (!evaluator) return prev;
      return prev.map((g) => {
        if (g.id === fromGroupId) return { ...g, evaluators: g.evaluators.filter((e) => e.userId !== userId) };
        if (g.id === toGroupId) return { ...g, evaluators: [...g.evaluators, evaluator] };
        return g;
      });
    });
  }

  /**
   * FEAT-0022 — replica no banco os moves manuais feitos na prévia local. `organizePresencial`
   * só sabe reproduzir o cálculo automático (mesmo `evaluatorUserIds` da última prévia);
   * qualquer diferença entre `localGroups` (o que a gestão viu e aprovou) e o resultado
   * recém-persistido é corrigida aqui via os mesmos `PATCH` de mover já usados no card de grupo
   * real (`MoveCandidateControl`/`MoveEvaluatorControl`). O casamento entre grupo da prévia e
   * grupo real é pelo NOME (`"Sala X - Grupo N"`) — determinístico dado o mesmo
   * `evaluatorUserIds` (só o `id` muda a cada chamada, é gerado na hora).
   */
  async function reconcileManualMoves(result: { groups: GroupSummary[] }) {
    if (!localGroups) return;

    const realIdByName = new Map(result.groups.map((g) => [g.name, g.id] as const));
    const realCandidateGroup = new Map<string, string>();
    const realEvaluatorGroup = new Map<string, string>();
    for (const g of result.groups) {
      for (const c of g.candidates) realCandidateGroup.set(c.id, g.id);
      for (const e of g.evaluators) if (e.role === "avaliador") realEvaluatorGroup.set(e.userId, g.id);
    }

    const pending: Promise<unknown>[] = [];
    for (const group of localGroups) {
      const targetRealId = realIdByName.get(group.name);
      if (!targetRealId) continue;

      for (const candidate of group.candidates) {
        const currentRealId = realCandidateGroup.get(candidate.id);
        if (currentRealId && currentRealId !== targetRealId) {
          pending.push(moveCandidate.mutateAsync({ groupId: targetRealId, candidateId: candidate.id }));
        }
      }
      for (const evaluator of group.evaluators) {
        if (evaluator.role !== "avaliador") continue;
        const currentRealId = realEvaluatorGroup.get(evaluator.userId);
        if (currentRealId && currentRealId !== targetRealId) {
          pending.push(moveEvaluator.mutateAsync({ groupId: targetRealId, userId: evaluator.userId }));
        }
      }
    }

    if (pending.length > 0) await Promise.all(pending);
  }

  async function handleApprove() {
    if (!selected) return;
    try {
      const result = await organize.mutateAsync(Array.from(selected));
      await reconcileManualMoves(result);
      toast.success(
        result.unallocatedCandidateCount > 0
          ? `Grupos organizados — ${result.unallocatedCandidateCount} candidato(s) ficaram sem grupo (capacidade insuficiente).`
          : "Grupos organizados.",
      );
      void queryClient.invalidateQueries({ queryKey: ["evaluators"] }); // reflete promoções/rebaixamentos
      handleOpenChange(false);
    } catch {
      toast.error("Não foi possível organizar os grupos.");
    }
  }

  const filteredEvaluators = useMemo(() => {
    const availableEvaluators = preview.data?.availableEvaluators ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return availableEvaluators;
    return availableEvaluators.filter((e) => e.name.toLowerCase().includes(term));
  }, [preview.data, search]);

  const evaluatorCounts = useMemo(() => {
    const all = preview.data?.availableEvaluators ?? [];
    return {
      hostCount: all.filter((e) => e.role === "host").length,
      avaliadorTotal: all.filter((e) => e.role === "avaliador").length,
      avaliadorSelected: selected?.size ?? 0,
    };
  }, [preview.data, selected]);

  const idealPlan = useMemo(() => {
    if (!preview.data) return null;
    const totalCandidates =
      preview.data.groups.reduce((sum, g) => sum + g.candidates.length, 0) + preview.data.unallocatedCandidateCount;
    if (totalCandidates === 0) return null;

    const idealGroups = derivePresencialGroupCount(totalCandidates);
    const roomPlan = recommendRoomsForGroups(idealGroups);
    return {
      totalCandidates,
      idealGroups,
      idealRooms: roomPlan.reduce((sum, tier) => sum + tier.roomsNeeded, 0),
      idealHosts: roomPlan.reduce((sum, tier) => sum + tier.hostCount * tier.roomsNeeded, 0),
      minEvaluators: idealGroups * deriveEvaluatorTargetForGroupSize(3),
      maxEvaluators: idealGroups * deriveEvaluatorTargetForGroupSize(5),
    };
  }, [preview.data]);

  const groupsToShow = useMemo(() => localGroups ?? preview.data?.groups ?? [], [localGroups, preview.data]);

  /**
   * FEAT-0022 (US1/US2) — um único passe sobre `groupsToShow` monta os dois diagnósticos:
   * déficit de host (`calculateHostDeficit`, soma por SALA distinta, não por grupo — uma sala
   * com 2 grupos conta uma vez) e classificação de cada grupo (`classifyPresencialGroup`).
   * `deviations` é a lista pro resumo do topo — inclui tanto "aceitável" (3 candidatos, abaixo
   * do ideal) quanto "fora do ideal", já que o pedido original cita "sala com 1 grupo de 3
   * candidatos" como exemplo de ponto fora da recomendação principal.
   */
  const organizationDiagnostics = useMemo(() => {
    const hostsByRoom = new Map<string, Set<string>>();
    const roomInfo = new Map<string, { name: string; size: number }>();
    for (const g of groupsToShow) {
      if (!g.room) continue;
      if (!roomInfo.has(g.room.id)) roomInfo.set(g.room.id, { name: g.room.name, size: g.room.size });
      const hostSet = hostsByRoom.get(g.room.id) ?? new Set<string>();
      for (const e of g.evaluators) if (e.role === "host") hostSet.add(e.userId);
      hostsByRoom.set(g.room.id, hostSet);
    }

    const deviations: string[] = [];
    const roomDiagnostics = new Map<string, { hostCount: number; hostExpected: number }>();
    for (const [roomId, info] of roomInfo) {
      const hostCount = hostsByRoom.get(roomId)?.size ?? 0;
      const hostExpected = deriveRoomCapacity(info.size).hostCount;
      roomDiagnostics.set(roomId, { hostCount, hostExpected });
      if (hostCount !== hostExpected) {
        deviations.push(`${info.name} está com ${hostCount} host(s) — o recomendado é ${hostExpected}.`);
      }
    }

    const groupDiagnostics = new Map<string, "ideal" | "aceitavel" | "fora_do_ideal">();
    for (const g of groupsToShow) {
      if (g.candidates.length === 0) continue; // não deve existir na prévia real, mas um move manual pode esvaziar um grupo
      const evaluatorCount = g.evaluators.filter((e) => e.role === "avaliador").length;
      const classification = classifyPresencialGroup(g.candidates.length, evaluatorCount);
      groupDiagnostics.set(g.id, classification);
      const label = g.room?.name ?? g.name;
      if (classification === "fora_do_ideal") {
        deviations.push(`${label} tem um grupo fora do ideal (${g.candidates.length} candidato(s), ${evaluatorCount} avaliador(es)).`);
      } else if (classification === "aceitavel") {
        deviations.push(`${label} tem 1 grupo de 3 candidatos (aceitável, mas abaixo do ideal de 4-5).`);
      }
    }

    const hostDeficit = calculateHostDeficit(
      Array.from(roomInfo.values()).map((r) => r.size),
      evaluatorCounts.hostCount,
    );

    return { roomDiagnostics, groupDiagnostics, deviations, hostDeficit, roomsUsedCount: roomInfo.size };
  }, [groupsToShow, evaluatorCounts.hostCount]);

  /** FEAT-0022 (US1, FR-003) — primeiros N avaliadores participando, na ordem já devolvida pelo servidor. */
  const suggestedForHostIds = useMemo(() => {
    const deficit = organizationDiagnostics.hostDeficit.deficit;
    if (deficit === 0 || !selected) return new Set<string>();
    const participatingAvaliadorIds = (preview.data?.availableEvaluators ?? [])
      .filter((e) => e.role === "avaliador" && selected.has(e.userId))
      .map((e) => e.userId);
    return new Set(participatingAvaliadorIds.slice(0, deficit));
  }, [organizationDiagnostics.hostDeficit.deficit, preview.data, selected]);

  /** FEAT-0022 (US3) — mesma pipeline do bloco "quantidade ideal" acima, aplicada a mais de uma contagem de referência. */
  const scenarioRows = useMemo(() => {
    return [5, 20, 50].map((candidateCount) => {
      const idealGroups = derivePresencialGroupCount(candidateCount);
      const roomPlan = recommendRoomsForGroups(idealGroups);
      return {
        candidateCount,
        idealGroups,
        idealRooms: roomPlan.reduce((sum, tier) => sum + tier.roomsNeeded, 0),
        idealHosts: roomPlan.reduce((sum, tier) => sum + tier.hostCount * tier.roomsNeeded, 0),
        minEvaluators: idealGroups * deriveEvaluatorTargetForGroupSize(3),
        maxEvaluators: idealGroups * deriveEvaluatorTargetForGroupSize(5),
      };
    });
  }, []);

  /** FEAT-0022 (US3, FR-010) — por que o ideal calculado acima não é alcançável com o que está presente agora. */
  const shortageMessages = useMemo(() => {
    if (!idealPlan) return [];
    const messages: string[] = [];
    if (evaluatorCounts.avaliadorTotal < idealPlan.minEvaluators) {
      messages.push(
        `Só ${evaluatorCounts.avaliadorTotal} avaliador(es) presente(s) — o ideal pra ${idealPlan.totalCandidates} candidato(s) seria ${idealPlan.minEvaluators}-${idealPlan.maxEvaluators}.`,
      );
    }
    if (organizationDiagnostics.hostDeficit.deficit > 0) {
      messages.push(`Faltam ${organizationDiagnostics.hostDeficit.deficit} host(s) pra estrutura calculada.`);
    }
    if (organizationDiagnostics.roomsUsedCount < idealPlan.idealRooms) {
      messages.push(
        `A distribuição está usando ${organizationDiagnostics.roomsUsedCount} sala(s); o ideal pra essa quantidade de candidatos seria ${idealPlan.idealRooms}.`,
      );
    }
    return messages;
  }, [idealPlan, evaluatorCounts, organizationDiagnostics]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CalculatorIcon aria-hidden />
          Simular grupos
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Simular organização dos grupos presenciais</DialogTitle>
          <DialogDescription>
            Nada é aplicado até você clicar em &quot;Aprovar simulação e organizar grupos&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          {preview.isPending && !preview.data ? (
            <div className="flex items-center justify-center gap-3 py-16" aria-busy="true">
              <Spinner className="text-primary size-5" />
              <p className="text-muted-foreground text-sm">Calculando…</p>
            </div>
          ) : preview.isError ? (
            <p className="text-destructive py-8 text-center text-sm" role="alert">
              Não foi possível calcular a simulação. Feche e tente de novo.
            </p>
          ) : preview.data ? (
            <div className="flex flex-col gap-6">
              {idealPlan && (
                <section className="border-border bg-muted/30 rounded-lg border p-3">
                  <h3 className="mb-1 text-sm font-semibold">Quantidade ideal para {idealPlan.totalCandidates} candidato(s)</h3>
                  <p className="text-muted-foreground text-sm">
                    {idealPlan.idealRooms} sala{idealPlan.idealRooms === 1 ? "" : "s"} · {idealPlan.idealHosts} host
                    {idealPlan.idealHosts === 1 ? "" : "s"} · {idealPlan.minEvaluators}–{idealPlan.maxEvaluators} avaliadores em{" "}
                    {idealPlan.idealGroups} grupo{idealPlan.idealGroups === 1 ? "" : "s"}
                  </p>

                  {shortageMessages.length > 0 && (
                    <div className="border-border/60 mt-2 border-t pt-2">
                      <p className="text-muted-foreground mb-1 text-xs font-medium">Por que não dá pra chegar no ideal agora:</p>
                      <ul className="text-muted-foreground list-inside list-disc text-xs">
                        {shortageMessages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="border-border/60 mt-3 border-t pt-2">
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Outros cenários de referência</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="py-1 pr-3 font-medium">Candidatos</th>
                            <th className="py-1 pr-3 font-medium">Grupos</th>
                            <th className="py-1 pr-3 font-medium">Salas</th>
                            <th className="py-1 pr-3 font-medium">Hosts</th>
                            <th className="py-1 font-medium">Avaliadores</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarioRows.map((row) => (
                            <tr key={row.candidateCount} className="border-border/60 border-t">
                              <td className="py-1 pr-3">{row.candidateCount}</td>
                              <td className="py-1 pr-3">{row.idealGroups}</td>
                              <td className="py-1 pr-3">{row.idealRooms}</td>
                              <td className="py-1 pr-3">{row.idealHosts}</td>
                              <td className="py-1">
                                {row.minEvaluators}–{row.maxEvaluators}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {organizationDiagnostics.hostDeficit.deficit > 0 && (
                <p className="text-destructive text-sm">
                  É necessário mais {organizationDiagnostics.hostDeficit.deficit} host
                  {organizationDiagnostics.hostDeficit.deficit === 1 ? "" : "s"} para seguir a configuração recomendada — avaliador(es)
                  sugerido(s) pra promoção estão destacados na lista abaixo.
                </p>
              )}

              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Avaliadores presentes</h3>
                  <p className="text-muted-foreground text-xs">
                    {evaluatorCounts.avaliadorSelected} de {evaluatorCounts.avaliadorTotal} avaliador(es) selecionado(s) ·{" "}
                    {evaluatorCounts.hostCount} host{evaluatorCounts.hostCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="relative mb-3">
                  <SearchIcon
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar avaliador pelo nome…"
                    className="pl-9"
                    aria-label="Buscar avaliador pelo nome"
                  />
                </div>
                <ul className="border-border max-h-52 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                  {filteredEvaluators.map((evaluator) => (
                    <EvaluatorRow
                      key={evaluator.userId}
                      evaluator={evaluator}
                      checked={evaluator.role === "avaliador" ? (selected?.has(evaluator.userId) ?? false) : null}
                      suggestedForHost={suggestedForHostIds.has(evaluator.userId)}
                      onToggle={() => toggleEvaluator(evaluator.userId)}
                      onPromote={() => handlePromote(evaluator.userId)}
                      onDemote={() => handleDemote(evaluator.userId)}
                      promoting={promote.isPending}
                      demoting={demote.isPending}
                    />
                  ))}
                  {filteredEvaluators.length === 0 && (
                    <li className="text-muted-foreground px-2 py-4 text-center text-sm">Nenhum avaliador encontrado.</li>
                  )}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <UsersRoundIcon className="size-4" aria-hidden />
                  Prévia da distribuição
                </h3>
                {preview.data.unallocatedCandidateCount > 0 && (
                  <p className="text-destructive mb-3 text-sm">
                    {preview.data.unallocatedCandidateCount} candidato(s) ficariam sem grupo — capacidade das salas
                    insuficiente.
                  </p>
                )}
                {groupsToShow.length > 0 &&
                  (organizationDiagnostics.deviations.length === 0 ? (
                    <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">
                      Organização segue a configuração ideal.
                    </p>
                  ) : (
                    <ul className="text-muted-foreground mb-3 list-inside list-disc text-sm">
                      {organizationDiagnostics.deviations.map((deviation) => (
                        <li key={deviation}>{deviation}</li>
                      ))}
                    </ul>
                  ))}
                {groupsToShow.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum candidato presencial presente pra simular.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {groupsToShow.map((group) => (
                      <PreviewGroupCard
                        key={group.id}
                        group={group}
                        allGroups={groupsToShow}
                        classification={organizationDiagnostics.groupDiagnostics.get(group.id) ?? null}
                        roomHostDiagnostic={group.room ? (organizationDiagnostics.roomDiagnostics.get(group.room.id) ?? null) : null}
                        onMoveCandidate={moveCandidateLocal}
                        onMoveEvaluator={moveEvaluatorLocal}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleApprove}
            disabled={!preview.data || preview.data.groups.length === 0 || organize.isPending}
          >
            {organize.isPending ? <Spinner aria-hidden /> : null}
            Aprovar simulação e organizar grupos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EvaluatorRow({
  evaluator,
  checked,
  suggestedForHost,
  onToggle,
  onPromote,
  onDemote,
  promoting,
  demoting,
}: {
  evaluator: AvailableEvaluator;
  /** `null` = é host, sem checkbox de participação (sempre usado automaticamente). */
  checked: boolean | null;
  /** FEAT-0022 (US1) — selo indicando que este avaliador está entre os sugeridos pra cobrir o déficit de host. */
  suggestedForHost: boolean;
  onToggle: () => void;
  onPromote: () => void;
  onDemote: () => void;
  promoting: boolean;
  demoting: boolean;
}) {
  const isHost = evaluator.role === "host";

  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
      <label className="flex min-w-0 flex-1 items-center gap-2">
        {checked !== null ? (
          <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Incluir ${evaluator.name} na organização`} />
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}
        <MemberName name={evaluator.name} memberStatus={evaluator.memberStatus} />
        <span
          className={
            isHost
              ? "border-primary/20 bg-primary/10 text-primary ml-1 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
              : "border-border text-muted-foreground ml-1 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
          }
        >
          {isHost ? "Host" : "Avaliador"}
        </span>
        {suggestedForHost && (
          <span className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 ml-1 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">
            Sugerido pra host
          </span>
        )}
      </label>
      {isHost ? (
        <Button type="button" variant="ghost" size="sm" disabled={demoting} onClick={onDemote}>
          Rebaixar a avaliador
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="sm" disabled={promoting} onClick={onPromote}>
          Promover a host
        </Button>
      )}
    </li>
  );
}

const GROUP_CLASSIFICATION_LABEL: Record<"ideal" | "aceitavel" | "fora_do_ideal", string> = {
  ideal: "Ideal",
  aceitavel: "Aceitável",
  fora_do_ideal: "Fora do ideal",
};

const GROUP_CLASSIFICATION_CLASSNAME: Record<"ideal" | "aceitavel" | "fora_do_ideal", string> = {
  ideal: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  aceitavel: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  fora_do_ideal: "border-destructive/30 bg-destructive/10 text-destructive",
};

function PreviewGroupCard({
  group,
  allGroups,
  classification,
  roomHostDiagnostic,
  onMoveCandidate,
  onMoveEvaluator,
}: {
  group: GroupSummary;
  /** Todos os grupos da prévia atual — vira os alvos possíveis de um move manual (item 4). */
  allGroups: GroupSummary[];
  /** FEAT-0022 (US2) — `null` quando o grupo está vazio (não classificado, ver `organizationDiagnostics`). */
  classification: "ideal" | "aceitavel" | "fora_do_ideal" | null;
  /** FEAT-0022 (US2) — `null` quando o grupo é online (sem sala). */
  roomHostDiagnostic: { hostCount: number; hostExpected: number } | null;
  onMoveCandidate: (candidateId: string, fromGroupId: string, toGroupId: string) => void;
  onMoveEvaluator: (userId: string, fromGroupId: string, toGroupId: string) => void;
}) {
  const moveTargets = allGroups.filter((g) => g.id !== group.id);

  return (
    <article className="bg-card border-border rounded-xl border p-3 shadow-sm">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h4 className="font-heading text-sm font-semibold">{group.room?.name ?? "Sala"}</h4>
          <p className="text-muted-foreground text-xs">
            {group.name} — {group.candidates.length} pessoa{group.candidates.length === 1 ? "" : "s"}
          </p>
          {roomHostDiagnostic && roomHostDiagnostic.hostCount !== roomHostDiagnostic.hostExpected && (
            <p className="text-destructive text-xs">
              Host: {roomHostDiagnostic.hostCount}/{roomHostDiagnostic.hostExpected}
            </p>
          )}
        </div>
        {classification && (
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${GROUP_CLASSIFICATION_CLASSNAME[classification]}`}
          >
            {GROUP_CLASSIFICATION_LABEL[classification]}
          </span>
        )}
      </header>

      <ul className="mb-2 flex flex-col gap-1">
        {group.candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between gap-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{candidate.name}</span>
              <GenderBadge gender={candidate.gender} />
            </span>
            {moveTargets.length > 0 && (
              <PreviewMoveSelect
                targets={moveTargets}
                onSelect={(targetGroupId) => onMoveCandidate(candidate.id, group.id, targetGroupId)}
              />
            )}
          </li>
        ))}
        {group.candidates.length === 0 && <li className="text-muted-foreground text-sm">Nenhum candidato.</li>}
      </ul>

      <div className="border-border border-t pt-2">
        <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
          Avaliadores/host ({group.evaluators.length})
        </p>
        <ul className="flex flex-col gap-1">
          {group.evaluators.map((evaluator) => (
            <li key={evaluator.userId} className="flex items-center justify-between gap-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-1">
                <MemberName name={evaluator.name} memberStatus={evaluator.memberStatus} />
                <span
                  className={
                    evaluator.role === "host"
                      ? "border-primary/20 bg-primary/10 text-primary shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                      : "border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                  }
                >
                  {evaluator.role === "host" ? "Host" : "Avaliador"}
                </span>
              </span>
              {/* Host é recurso da sala inteira (replicado em todo grupo dela) — sem move individual aqui. */}
              {evaluator.role === "avaliador" && moveTargets.length > 0 && (
                <PreviewMoveSelect
                  targets={moveTargets}
                  onSelect={(targetGroupId) => onMoveEvaluator(evaluator.userId, group.id, targetGroupId)}
                />
              )}
            </li>
          ))}
          {group.evaluators.length === 0 && <li className="text-muted-foreground text-sm">Nenhum avaliador/host.</li>}
        </ul>
      </div>
    </article>
  );
}

function PreviewMoveSelect({ targets, onSelect }: { targets: GroupSummary[]; onSelect: (targetGroupId: string) => void }) {
  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger size="sm" className="h-7 w-28 shrink-0 text-xs">
        <SelectValue placeholder="Mover para…" />
      </SelectTrigger>
      <SelectContent>
        {targets.map((target) => (
          <SelectItem key={target.id} value={target.id}>
            {target.room?.name ?? "Sala"} — {target.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
