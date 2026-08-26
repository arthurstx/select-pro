"use client";

import { UsersRoundIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";
import type { GroupSummary } from "shared";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useMoveCandidateMutation, useMoveEvaluatorMutation } from "@/lib/group/queries";

interface GroupCardProps {
  group: GroupSummary;
  /** Todos os grupos da organização atual — usado para montar os destinos possíveis de um `move*` (US2). */
  allGroups: GroupSummary[];
}

/**
 * Um grupo formado. Sem `gender` por candidato (mesma postura de
 * `CandidateCheckinItemSchema`, FEAT-0005) — a regra D1 é verificada pelo
 * backend; uma violação chega aqui como o aviso `GENDER_RULE_VIOLATED` de
 * `MoveResultResponse`, nunca identificando quem.
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
              <span className="truncate">{candidate.name}</span>
              {moveTargets.length > 0 && (
                <MoveCandidateControl groupId={group.id} candidateId={candidate.id} targets={moveTargets} />
              )}
            </li>
          ))}
          {group.candidates.length === 0 && <li className="text-muted-foreground text-sm">Nenhum candidato.</li>}
        </ul>
      </section>

      {group.modality === "presencial" && (
        <section>
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
            Avaliadores/hosts ({group.evaluators.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {group.evaluators.map((evaluator) => (
              <li key={evaluator.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {evaluator.name}{" "}
                  <span
                    className={cn(
                      "ml-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase",
                      evaluator.role === "host" ? "bg-primary/10 text-primary border-primary/20" : "border-border text-muted-foreground",
                    )}
                  >
                    {evaluator.role === "host" ? "Host" : "Avaliador"}
                  </span>
                </span>
                {moveTargets.length > 0 && (
                  <MoveEvaluatorControl groupId={group.id} userId={evaluator.userId} targets={moveTargets} />
                )}
              </li>
            ))}
            {group.evaluators.length === 0 && <li className="text-muted-foreground text-sm">Nenhum avaliador/host alocado.</li>}
          </ul>
        </section>
      )}
    </article>
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
