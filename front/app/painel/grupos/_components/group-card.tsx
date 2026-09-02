"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOutIcon, UserPlusIcon, UsersRoundIcon, VideoIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ROLES, type GroupSummary } from "shared";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { listEvaluators } from "@/lib/evaluators/evaluators-api";
import {
  useAssignEvaluatorOnlineMutation,
  useJoinOnlineGroupMutation,
  useLeaveOnlineGroupMutation,
  useMoveCandidateMutation,
  useMoveEvaluatorMutation,
} from "@/lib/group/queries";
import { cn } from "@/lib/utils";

import { GenderBadge } from "./gender-badge";
import { MemberName } from "./member-name";

interface GroupCardProps {
  group: GroupSummary;
  /** Todos os grupos da organização atual — usado para montar os destinos possíveis de um `move*` (US2). */
  allGroups: GroupSummary[];
}

/**
 * Um grupo formado. Candidato mostra `gender` desde a FEAT-0021 (badge discreto, US3) — sem
 * risco de privacidade aqui: `/groups` é inteiramente admin-only, diferente do check-in
 * (FEAT-0005), onde o dado continua escondido. A regra D1 é verificada pelo backend; uma
 * violação chega ao mover alguém como o aviso `GENDER_RULE_VIOLATED` de `MoveResultResponse`.
 *
 * FEAT-0018 — grupo online ganha ações próprias: o avaliador logado entra/sai por conta
 * própria, e o admin pode atribuir alguém diretamente (US3).
 */
export function GroupCard({ group, allGroups }: GroupCardProps) {
  // FR-003 — mover só é permitido entre grupos da mesma modalidade.
  const moveTargets = allGroups.filter((g) => g.id !== group.id && g.modality === group.modality);

  return (
    <article className="bg-card border-border rounded-xl border p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        {group.modality === "online" ? (
          <VideoIcon className="text-muted-foreground size-4" aria-hidden />
        ) : (
          <UsersRoundIcon className="text-muted-foreground size-4" aria-hidden />
        )}
        <h3 className="font-heading text-sm font-semibold">
          {group.modality === "online" ? "Online" : (group.room?.name ?? "Presencial")}
        </h3>
        <span className="text-muted-foreground text-xs">— {group.name}</span>
      </header>

      <section className="mb-3">
        <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
          Candidatos ({group.candidates.length})
        </p>
        <ul className="flex flex-col gap-1.5">
          {group.candidates.map((candidate) => (
            <li key={candidate.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{candidate.name}</span>
                <GenderBadge gender={candidate.gender} />
              </span>
              {moveTargets.length > 0 && (
                <MoveCandidateControl groupId={group.id} candidateId={candidate.id} targets={moveTargets} />
              )}
            </li>
          ))}
          {group.candidates.length === 0 && <li className="text-muted-foreground text-sm">Nenhum candidato.</li>}
        </ul>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
          Avaliadores/hosts ({group.evaluators.length})
        </p>
        <ul className="flex flex-col gap-1.5">
          {group.evaluators.map((evaluator) => (
            <li key={evaluator.userId} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1">
                <MemberName name={evaluator.name} memberStatus={evaluator.memberStatus} />
                <span
                  className={cn(
                    "ml-1 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase",
                    evaluator.role === "host" ? "bg-primary/10 text-primary border-primary/20" : "border-border text-muted-foreground",
                  )}
                >
                  {evaluator.role === "host" ? "Host" : "Avaliador"}
                </span>
              </span>
              {group.modality === "presencial" && moveTargets.length > 0 && (
                <MoveEvaluatorControl groupId={group.id} userId={evaluator.userId} targets={moveTargets} />
              )}
            </li>
          ))}
          {group.evaluators.length === 0 && <li className="text-muted-foreground text-sm">Nenhum avaliador/host alocado.</li>}
        </ul>
      </section>

      {group.modality === "online" && <OnlineGroupActions group={group} />}
    </article>
  );
}

/** FEAT-0018 (US2/US3) — self-service do avaliador logado + atribuição manual do admin. */
function OnlineGroupActions({ group }: { group: GroupSummary }) {
  const { user } = useAuth();
  if (!user) return null;

  const alreadyInThisGroup = group.evaluators.some((e) => e.userId === user.id);

  return (
    <div className="border-border mt-3 flex flex-col gap-2 border-t pt-3">
      {user.role === ROLES.AVALIADOR && (
        <JoinLeaveControl groupId={group.id} alreadyInThisGroup={alreadyInThisGroup} />
      )}
      {user.role === ROLES.ADMIN && <AssignEvaluatorControl group={group} />}
    </div>
  );
}

function JoinLeaveControl({ groupId, alreadyInThisGroup }: { groupId: string; alreadyInThisGroup: boolean }) {
  const join = useJoinOnlineGroupMutation();
  const leave = useLeaveOnlineGroupMutation();
  const pending = join.isPending || leave.isPending;

  if (alreadyInThisGroup) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => leave.mutate(undefined, { onError: () => toast.error("Não foi possível sair do grupo.") })}
      >
        {leave.isPending ? <Spinner aria-hidden /> : <LogOutIcon aria-hidden />}
        Sair do grupo
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => join.mutate(groupId, { onError: () => toast.error("Não foi possível entrar no grupo.") })}
    >
      {join.isPending ? <Spinner aria-hidden /> : <UserPlusIcon aria-hidden />}
      Participar do grupo
    </Button>
  );
}

/** US3 — gestão atribui um avaliador diretamente, sem ele precisar clicar em nada. */
function AssignEvaluatorControl({ group }: { group: GroupSummary }) {
  const evaluatorsQuery = useQuery({ queryKey: ["evaluators", "avaliador"], queryFn: () => listEvaluators("avaliador") });
  const assign = useAssignEvaluatorOnlineMutation();
  const [selected, setSelected] = useState("");

  const alreadyAllocatedIds = new Set(group.evaluators.map((e) => e.userId));
  const candidates = (evaluatorsQuery.data ?? []).filter((e) => !alreadyAllocatedIds.has(e.userId));

  if (evaluatorsQuery.isPending || candidates.length === 0) return null;

  function handleAssign() {
    if (!selected) return;
    assign.mutate(
      { groupId: group.id, userId: selected },
      {
        onSuccess: () => setSelected(""),
        onError: () => toast.error("Não foi possível atribuir este avaliador."),
      },
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
          <SelectValue placeholder="Atribuir avaliador…" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((evaluator) => (
            <SelectItem key={evaluator.userId} value={evaluator.userId}>
              {evaluator.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" variant="outline" disabled={!selected || assign.isPending} onClick={handleAssign}>
        {assign.isPending ? <Spinner aria-hidden /> : "Atribuir"}
      </Button>
    </div>
  );
}

function MoveCandidateControl({ groupId, candidateId, targets }: { groupId: string; candidateId: string; targets: GroupSummary[] }) {
  const move = useMoveCandidateMutation();

  function handleChange(targetGroupId: string) {
    move.mutate(
      { groupId: targetGroupId, candidateId },
      {
        onSuccess: (result) => {
          if (result.warning === "GENDER_RULE_VIOLATED") {
            toast.warning("Movido, mas um dos grupos ficou com apenas 1 mulher (regra D1).");
          }
        },
        onError: () => toast.error("Não foi possível mover este candidato."),
      },
    );
  }

  return <MoveSelect groupId={groupId} targets={targets} pending={move.isPending} onSelect={handleChange} />;
}

function MoveEvaluatorControl({ groupId, userId, targets }: { groupId: string; userId: string; targets: GroupSummary[] }) {
  const move = useMoveEvaluatorMutation();

  function handleChange(targetGroupId: string) {
    move.mutate(
      { groupId: targetGroupId, userId },
      { onError: () => toast.error("Não foi possível mover este avaliador/host.") },
    );
  }

  return <MoveSelect groupId={groupId} targets={targets} pending={move.isPending} onSelect={handleChange} />;
}

function MoveSelect({
  targets,
  pending,
  onSelect,
}: {
  groupId: string;
  targets: GroupSummary[];
  pending: boolean;
  onSelect: (targetGroupId: string) => void;
}) {
  if (pending) return <Spinner className="size-4 shrink-0" aria-hidden />;

  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger size="sm" className="h-7 w-28 shrink-0 text-xs">
        <SelectValue placeholder="Mover para…" />
      </SelectTrigger>
      <SelectContent>
        {targets.map((target) => (
          <SelectItem key={target.id} value={target.id}>
            {target.modality === "online" ? "Online" : (target.room?.name ?? "Presencial")} — {target.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
