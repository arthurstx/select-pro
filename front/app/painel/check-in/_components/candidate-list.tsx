"use client";

import { CircleAlertIcon, RefreshCwIcon, SearchXIcon, ServerCrashIcon, UsersIcon } from "lucide-react";
import { CheckinErrorCode, type CheckinStatusFilter, type ListCandidatesResponse } from "shared";
import type { UseQueryResult } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/api-error";

// Promovida para `painel/_components` na FEAT-0007 — o dashboard pagina do
// mesmo jeito, e duas barras idênticas divergiriam na primeira mudança.
import { PaginationBar } from "../../_components/pagination-bar";
import { CandidateRow } from "./candidate-row";

interface CandidateListProps {
  query: UseQueryResult<ListCandidatesResponse["data"], Error>;
  search: string;
  status: CheckinStatusFilter;
  onPageChange: (page: number) => void;
}

/**
 * Os quatro estados de lista vazia da seção 5, e a distinção entre erro que
 * derruba a tela inteira e erro que só some com o dado enquanto a lista
 * anterior segue visível (seção 5 / seção 8 desta spec).
 */
export function CandidateList({ query, search, status, onPageChange }: CandidateListProps) {
  const { data, isPending, isError, error, isFetching, refetch } = query;

  if (isPending) return <SkeletonList />;

  const noActiveProcess =
    isError && error instanceof ApiError && error.code === CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS;

  if (noActiveProcess) return <NoActiveProcessState />;

  if (isError && !data) {
    return <LoadErrorState onRetry={() => refetch()} />;
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      {isError && <InlineErrorBanner onRetry={() => refetch()} />}

      {data.items.length === 0 ? (
        <EmptyState search={search} status={status} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {data.items.map((item) => (
              <CandidateRow key={item.id} candidate={item} />
            ))}
          </div>
          <PaginationBar pagination={data.pagination} onPageChange={onPageChange} disabled={isFetching} />
        </>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando candidatos">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-[72px] w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * Sem processo corrente: desde a FEAT-0005 v1.2 a edição é criada sob
 * demanda pelo próprio backend, então este estado só aparece se algo tiver
 * quebrado — não sugerimos nenhuma ação que o avaliador não possa executar.
 */
function NoActiveProcessState() {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
      <ServerCrashIcon className="text-muted-foreground size-8" aria-hidden />
      <div>
        <p className="font-medium">O check-in está indisponível no momento.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Não foi possível determinar o processo seletivo corrente. Avise quem administra o sistema.
        </p>
      </div>
    </div>
  );
}

function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
      <CircleAlertIcon className="text-destructive size-8" aria-hidden />
      <div>
        <p className="font-medium">Não foi possível carregar os candidatos.</p>
        <p className="text-muted-foreground mt-1 text-sm">Verifique sua conexão e tente novamente.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RefreshCwIcon aria-hidden />
        Tentar novamente
      </Button>
    </div>
  );
}

function InlineErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
      <span className="text-destructive flex items-center gap-2">
        <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
        Não foi possível atualizar a lista agora. Os dados abaixo podem estar desatualizados.
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}

function EmptyState({ search, status }: { search: string; status: CheckinStatusFilter }) {
  if (search) {
    return (
      <EmptyMessage
        icon={<SearchXIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Nenhum candidato encontrado."
        description={`Não encontramos ninguém para "${search}". Confira a grafia ou tente outro termo.`}
      />
    );
  }

  if (status === "presentes") {
    return (
      <EmptyMessage
        icon={<UsersIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Nenhuma presença confirmada ainda."
        description="Assim que alguém for marcado, aparece aqui."
      />
    );
  }

  if (status === "ausentes") {
    return (
      <EmptyMessage
        icon={<UsersIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Todos os candidatos já fizeram check-in."
        description="Não há ninguém aguardando confirmação de presença."
      />
    );
  }

  return (
    <EmptyMessage
      icon={<UsersIcon className="text-muted-foreground size-8" aria-hidden />}
      title="Nenhum candidato inscrito neste processo seletivo."
      description="Assim que houver inscrições, elas aparecem aqui."
    />
  );
}

function EmptyMessage({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
      {icon}
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}
