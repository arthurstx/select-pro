"use client";

import { CircleAlertIcon, UsersRoundIcon } from "lucide-react";
import { CheckinErrorCode, EvaluationErrorCode } from "shared";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/api-error";
import { useMyGroupQuery } from "@/lib/evaluation/queries";

import { StateMessage } from "../_components/state-message";
import { CandidateEvaluationCard } from "./_components/candidate-evaluation-card";

/** FEAT-0013, US1 — avaliador/host avalia os candidatos do próprio grupo presencial. */
export default function MinhasAvaliacoesPage() {
  const query = useMyGroupQuery();
  const { data, isPending, isError, error, refetch } = query;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Minhas Avaliações</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Avalie os candidatos do seu grupo{data ? ` (${data.groupName})` : ""}.
        </p>
      </div>

      {isPending ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data ? (
        <div className="flex flex-col gap-3">
          {data.candidates.map((candidate) => (
            <CandidateEvaluationCard key={candidate.id} candidate={candidate} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando candidatos">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-xl" />
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

  if (error instanceof ApiError && error.code === EvaluationErrorCode.NOT_IN_ANY_GROUP) {
    return (
      <StateMessage
        icon={<UsersRoundIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Você não está alocado a nenhum grupo nesta edição."
        description="Avise o admin — os grupos são organizados na tela de Grupos."
      />
    );
  }

  return (
    <StateMessage
      icon={<CircleAlertIcon className="text-destructive size-8" aria-hidden />}
      title="Não foi possível carregar seu grupo."
      description="Verifique sua conexão e tente novamente."
      action={{ label: "Tentar novamente", onClick: onRetry }}
    />
  );
}
