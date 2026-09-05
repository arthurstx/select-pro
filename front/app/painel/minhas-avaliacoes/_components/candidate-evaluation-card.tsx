"use client";

import { useState } from "react";
import type { MyGroupCandidate } from "shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { EvaluationForm } from "./evaluation-form";

const COLOR_DOT: Record<string, string> = {
  GREEN: "bg-success",
  YELLOW: "bg-amber-500",
  RED: "bg-destructive",
};

interface CandidateEvaluationCardProps {
  candidate: MyGroupCandidate;
}

/** Uma linha da lista do avaliador — abre o formulário (pré-preenchido se já avaliado, FR-004). */
export function CandidateEvaluationCard({ candidate }: CandidateEvaluationCardProps) {
  const [open, setOpen] = useState(false);
  const evaluated = candidate.myEvaluation !== null;

  return (
    <article className="bg-card border-border rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{candidate.name}</h3>
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-sm">
            {evaluated && candidate.myEvaluation && (
              <span className={cn("size-2 shrink-0 rounded-full", COLOR_DOT[candidate.myEvaluation.overallColor])} aria-hidden />
            )}
            {candidate.evaluationCount} {candidate.evaluationCount === 1 ? "avaliação recebida" : "avaliações recebidas"}
          </p>
        </div>
        <Button type="button" variant={evaluated ? "outline" : "default"} size="sm" onClick={() => setOpen((o) => !o)}>
          {evaluated ? "Ver/editar avaliação" : "Avaliar"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 border-t pt-4">
          <EvaluationForm candidate={candidate} onSaved={() => setOpen(false)} />
        </div>
      )}
    </article>
  );
}
