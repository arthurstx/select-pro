"use client";

import { CRITERION_LABELS, type EvaluationCriterion } from "shared";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminCandidateDetailQuery } from "@/lib/evaluation/queries";

import { VerdictBadge } from "./verdict-badge";

const CRITERIA_ORDER: EvaluationCriterion[] = [
  "raciocinio_logico",
  "trabalho_equipe",
  "lideranca",
  "proatividade",
  "comunicacao",
];

const COLOR_LABEL: Record<string, string> = { GREEN: "Verde", YELLOW: "Amarelo", RED: "Vermelho" };

interface EvaluationDetailSheetProps {
  candidateId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** FR-008 — detalhe de todas as avaliações de um candidato, com autor (visão do admin, sem isolamento). */
export function EvaluationDetailSheet({ candidateId, onOpenChange }: EvaluationDetailSheetProps) {
  const query = useAdminCandidateDetailQuery(candidateId);

  return (
    <Sheet open={candidateId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{query.data?.name ?? "Candidato"}</SheetTitle>
          {query.data && (
            <SheetDescription className="flex items-center gap-2">
              Veredito: <VerdictBadge verdict={query.data.verdict} />
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {query.isPending && (
            <>
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </>
          )}

          {query.isSuccess && query.data.evaluations.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhuma avaliação recebida ainda.</p>
          )}

          {query.isSuccess &&
            query.data.evaluations.map((evaluation, index) => (
              <article key={index} className="border-border rounded-xl border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{evaluation.evaluatorName}</span>
                  <span className="text-muted-foreground text-sm">{COLOR_LABEL[evaluation.overallColor]}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {CRITERIA_ORDER.map((criterion) => (
                    <div key={criterion} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{CRITERION_LABELS[criterion]}</dt>
                      <dd className="font-medium tabular-nums">{evaluation.scores[criterion]}/5</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted-foreground mt-2 text-sm">
                  Pontuação ponderada: <span className="font-medium tabular-nums">{evaluation.weightedScore.toFixed(2)}</span>
                </p>
                {evaluation.feedback && <p className="mt-2 text-sm italic">&ldquo;{evaluation.feedback}&rdquo;</p>}
              </article>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
