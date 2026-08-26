"use client";

import { CircleAlertIcon, ClipboardListIcon } from "lucide-react";
import { useState } from "react";
import { CheckinErrorCode } from "shared";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api/api-error";
import { useAdminCandidatesQuery } from "@/lib/evaluation/queries";

import { StateMessage } from "../_components/state-message";
import { EvaluationDetailSheet } from "./_components/evaluation-detail-sheet";
import { VerdictBadge } from "./_components/verdict-badge";

/** FEAT-0013, US2 — admin acompanha veredito e detalhe das avaliações de cada candidato. */
export default function AvaliacoesPage() {
  const query = useAdminCandidatesQuery();
  const { data, isPending, isError, error, refetch } = query;
  const [detailCandidateId, setDetailCandidateId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Avaliações</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Veredito de cada candidato presente, calculado a partir das avaliações recebidas.
        </p>
      </div>

      {isPending ? (
        <SkeletonTable />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data && data.candidates.length > 0 ? (
        <div className="border-border overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Avaliações</TableHead>
                <TableHead>Veredito</TableHead>
                <TableHead className="text-right">Pontuação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.candidates.map((candidate) => (
                <TableRow
                  key={candidate.id}
                  className="hover:bg-accent/50 cursor-pointer"
                  onClick={() => setDetailCandidateId(candidate.id)}
                >
                  <TableCell className="font-medium">{candidate.name}</TableCell>
                  <TableCell className="text-muted-foreground">{candidate.evaluationCount}</TableCell>
                  <TableCell>
                    <VerdictBadge verdict={candidate.verdict} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {candidate.weightedScore !== null ? candidate.weightedScore.toFixed(2) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <StateMessage
          icon={<ClipboardListIcon className="text-muted-foreground size-8" aria-hidden />}
          title="Nenhum candidato presente ainda."
          description="O veredito aparece aqui assim que houver candidatos com check-in feito."
        />
      )}

      <EvaluationDetailSheet candidateId={detailCandidateId} onOpenChange={(open) => !open && setDetailCandidateId(null)} />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando candidatos">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS) {
    return (
      <StateMessage
        icon={<CircleAlertIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Não foi possível determinar o processo seletivo corrente."
        description="Avise quem administra o sistema."
      />
    );
  }

  return (
    <StateMessage
      icon={<CircleAlertIcon className="text-destructive size-8" aria-hidden />}
      title="Não foi possível carregar as avaliações."
      description="Verifique sua conexão e tente novamente."
      action={{ label: "Tentar novamente", onClick: onRetry }}
    />
  );
}
