"use client";

import { CircleAlertIcon, SearchIcon, ServerCrashIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { CheckinErrorCode, MemberCheckinErrorCode } from "shared";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/api-error";
import { useMemberCheckinsQuery } from "@/lib/member-checkin/queries";

import { StateMessage } from "../_components/state-message";
import { MemberRow } from "./_components/member-row";
import { SummaryBar } from "./_components/summary-bar";

/**
 * FEAT-0010, US1/US2 — check-in de avaliadores/hosts da edição corrente.
 * Sem paginação (dezenas de pessoas, não milhares) — a busca por nome
 * filtra a lista já carregada, no cliente, sem round-trip à API.
 */
export default function CheckInMembrosPage() {
  const query = useMemberCheckinsQuery();
  const { data, isPending, isError, error, refetch } = query;
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.items;

    return data.items.filter((item) => item.name.toLowerCase().includes(term));
  }, [data, search]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Check-in de Membros</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Confirme a presença dos avaliadores e hosts do processo seletivo
          {data ? ` ${data.process.label}` : ""}.
        </p>
      </div>

      {isPending ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data ? (
        <>
          <SummaryBar summary={data.summary} />

          <div className="relative w-full md:w-[400px]">
            <SearchIcon
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar avaliador ou host pelo nome…"
              className="pl-9"
              aria-label="Buscar avaliador ou host pelo nome"
            />
          </div>

          {filteredItems.length > 0 ? (
            <div className="flex flex-col gap-2">
              {filteredItems.map((item) => (
                <MemberRow key={item.userId} member={item} />
              ))}
            </div>
          ) : (
            <StateMessage
              icon={<SearchIcon className="text-muted-foreground size-8" aria-hidden />}
              title="Nenhum avaliador ou host encontrado."
              description="Verifique o nome digitado e tente novamente."
              compact
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando avaliadores e hosts">
      <Skeleton className="h-14 w-full rounded-xl" />
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-[72px] w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * FR-008/FR-009: dois códigos de erro distintos precisam de duas mensagens
 * distintas — "sem processo corrente" não é o mesmo problema que "processo
 * corrente sem ninguém atribuído ainda" (Edge Cases da spec).
 */
function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS) {
    return (
      <StateMessage
        icon={<ServerCrashIcon className="text-muted-foreground size-8" aria-hidden />}
        title="O check-in está indisponível no momento."
        description="Não foi possível determinar o processo seletivo corrente. Avise quem administra o sistema."
      />
    );
  }

  if (error instanceof ApiError && error.code === MemberCheckinErrorCode.NO_EVALUATORS_IN_EDITION) {
    return (
      <StateMessage
        icon={<UsersIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Nenhum avaliador ou host foi atribuído a esta edição ainda."
        description='Atribua cargos no painel "Avaliadores" antes de iniciar o check-in.'
      />
    );
  }

  return (
    <StateMessage
      icon={<CircleAlertIcon className="text-destructive size-8" aria-hidden />}
      title="Não foi possível carregar a lista."
      description="Verifique sua conexão e tente novamente."
      action={{ label: "Tentar novamente", onClick: onRetry }}
    />
  );
}
