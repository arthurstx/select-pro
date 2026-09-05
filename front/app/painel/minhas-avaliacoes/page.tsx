"use client";

import { CircleAlertIcon, ShieldAlertIcon, UsersRoundIcon } from "lucide-react";
import { EvaluationErrorCode } from "shared";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/api-error";
import { useMyGroupQuery } from "@/lib/evaluation/queries";

import { StateMessage } from "../_components/state-message";
import { terminalErrorFor } from "../_lib/error-view";
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
          {data ? `Avalie os candidatos do grupo ${data.groupName}.` : "Avalie os candidatos do seu grupo."}
        </p>
      </div>

      {isPending ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.candidates.length === 0 ? (
        // Alocado a um grupo, mas ainda sem candidatos: antes daqui não sair
        // nada, a tela ficava em branco e parecia defeito.
        <StateMessage
          icon={<UsersRoundIcon className="text-muted-foreground size-8" aria-hidden />}
          title="Nenhum candidato no seu grupo ainda."
          description="Os candidatos aparecem aqui depois do check-in e da montagem dos grupos."
          action={{ label: "Atualizar", onClick: () => void refetch() }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.candidates.map((candidate) => (
            <CandidateEvaluationCard key={candidate.id} candidate={candidate} />
          ))}
        </div>
      )}
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

/**
 * A regra aqui é nunca dizer "erro genérico" quando a API disse o motivo: cada
 * código conhecido vira uma frase própria, e o que sobra mostra a mensagem que
 * o backend mandou em vez de chutar problema de conexão.
 */
function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  // Cobre NO_ACTIVE_SELECTION_PROCESS, MAINTENANCE_MODE e INSUFFICIENT_ROLE —
  // este último só alcançável se o papel em memória ficar velho (admin abrindo
  // a URL já é barrado pelo `RouteRoleGuard`).
  const terminal = terminalErrorFor(error);
  if (terminal) {
    return (
      <StateMessage
        icon={<ShieldAlertIcon className="text-muted-foreground size-8" aria-hidden />}
        title={terminal.title}
        description={terminal.description}
      />
    );
  }

  if (error instanceof ApiError && error.code === EvaluationErrorCode.NOT_IN_ANY_GROUP) {
    return (
      <StateMessage
        icon={<UsersRoundIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Você ainda não foi alocado a um grupo."
        // Com ação: sem ela o avaliador ficava preso na tela mesmo depois de o
        // admin organizar os grupos.
        description="Nesta edição do processo seletivo nenhum grupo foi atribuído a você. Fale com quem organiza os grupos — assim que a alocação sair, os candidatos aparecem aqui."
        action={{ label: "Atualizar", onClick: onRetry }}
      />
    );
  }

  return (
    <StateMessage
      icon={<CircleAlertIcon className="text-destructive size-8" aria-hidden />}
      title="Não foi possível carregar seu grupo."
      description={error instanceof ApiError ? error.message : "Verifique sua conexão e tente novamente."}
      action={{ label: "Tentar novamente", onClick: onRetry }}
    />
  );
}
