"use client";

import { CircleAlertIcon, UsersRoundIcon, VideoIcon } from "lucide-react";
import { CheckinErrorCode, type GroupModality } from "shared";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/api-error";
import { useGroupsQuery } from "@/lib/group/queries";

import { StateMessage } from "../../_components/state-message";
import { ClearOrganizationButton } from "./clear-organization-button";
import { GroupCard } from "./group-card";
import { SimulateOnlineOrganizeModal } from "./simulate-online-organize-modal";
import { SimulateOrganizeModal } from "./simulate-organize-modal";

const COPY: Record<GroupModality, { title: string; description: string; emptyDescription: string }> = {
  online: {
    title: "Grupos Online",
    description: "Candidatos presentes online — sem sala, sem avaliador automático (FEAT-0018).",
    emptyDescription: 'Clique em "Organizar online" para distribuir os candidatos online presentes.',
  },
  presencial: {
    title: "Grupos Presenciais",
    description: "Candidatos presentes presencialmente, distribuídos por sala e por gênero.",
    emptyDescription: 'Clique em "Simular grupos" para revisar e organizar os candidatos presenciais presentes.',
  },
};

/**
 * FEAT-0018 — presencial e online viraram rotas próprias no menu (dropdown "Grupos" na
 * sidebar), não mais seções de uma página só. Este componente é o corpo compartilhado das
 * duas páginas — busca a mesma lista (`GET /groups`, as duas modalidades) e exibe só a
 * modalidade pedida, reaproveitando `allGroups` inteiro para os alvos de `move*` no `GroupCard`.
 */
export function GroupsView({ modality }: { modality: GroupModality }) {
  const query = useGroupsQuery();
  const { data, isPending, isError, error, refetch } = query;
  const copy = COPY[modality];

  const groups = data?.groups.filter((g) => g.modality === modality) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
            {modality === "online" ? (
              <VideoIcon className="text-muted-foreground size-6" aria-hidden />
            ) : (
              <UsersRoundIcon className="text-muted-foreground size-6" aria-hidden />
            )}
            {copy.title}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{copy.description}</p>
        </div>
        <div className="flex gap-2">
          {/* FEAT-0021 — presencial não tem "Organizar grupos" direto (FR-004): só "Simular
              grupos" (configura + prévia + aprova) e "Limpar organização". FEAT-0022 — online
              ganha o mesmo conceito de simular-antes-de-aplicar (sem seção de avaliador, FR-015)
              e o mesmo "Limpar organização". */}
          <ClearOrganizationButton modality={modality} />
          {modality === "presencial" ? <SimulateOrganizeModal /> : <SimulateOnlineOrganizeModal />}
        </div>
      </div>

      {isPending ? (
        <SkeletonGrid />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : groups.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} allGroups={data?.groups ?? []} />
          ))}
        </div>
      ) : (
        <StateMessage
          icon={<UsersRoundIcon className="text-muted-foreground size-8" aria-hidden />}
          title="Nenhum grupo organizado ainda."
          description={copy.emptyDescription}
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
