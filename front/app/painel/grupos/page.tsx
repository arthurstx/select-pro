"use client";

import { CircleAlertIcon, UsersRoundIcon } from "lucide-react";
import { CheckinErrorCode } from "shared";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/api-error";
import { useGroupsQuery } from "@/lib/group/queries";

import { StateMessage } from "../_components/state-message";
import { GroupCard } from "./_components/group-card";
import { OrganizeButton } from "./_components/organize-button";

/** FEAT-0012 — organização automática de grupos da edição corrente. */
export default function GruposPage() {
  const query = useGroupsQuery();
  const { data, isPending, isError, error, refetch } = query;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Grupos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Organize automaticamente os candidatos presentes em grupos, respeitando a distribuição por sala e por gênero.
          </p>
        </div>
        <OrganizeButton />
      </div>

      {isPending ? (
        <SkeletonGrid />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data && data.groups.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.groups.map((group) => (
            <GroupCard key={group.id} group={group} allGroups={data.groups} />
          ))}
        </div>
      ) : (
        <StateMessage
          icon={<UsersRoundIcon className="text-muted-foreground size-8" aria-hidden />}
          title="Nenhum grupo organizado ainda."
          description='Clique em "Organizar grupos" para distribuir os candidatos presentes.'
        />
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Carregando grupos">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-48 w-full rounded-xl" />
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
      title="Não foi possível carregar os grupos."
      description="Verifique sua conexão e tente novamente."
      action={{ label: "Tentar novamente", onClick: onRetry }}
    />
  );
}
