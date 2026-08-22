"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, CalendarOffIcon, SearchXIcon, UsersIcon } from "lucide-react";
import {
  COURSE_LABELS,
  formatPhone,
  type DashboardCandidateItem,
  type DashboardCandidatesResponse,
  type DashboardCandidatesSort,
} from "shared";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatDate, initialsOf, semesterLabel } from "../_lib/format";
import { PaginationBar } from "./pagination-bar";
import { LoadErrorState, StateMessage } from "./state-message";

type ListData = DashboardCandidatesResponse["data"];

interface CandidatesTableProps {
  query: UseQueryResult<ListData, Error>;
  search: string;
  hasDateFilter: boolean;
  /** Mostra a coluna de edição só quando o recorte é "todas". */
  showEdition: boolean;
  /** `recent` (default) = mais nova primeiro; `oldest` inverte. */
  sort: DashboardCandidatesSort;
  onSelect: (candidate: DashboardCandidateItem) => void;
  onPageChange: (page: number) => void;
  onSortChange: (sort: DashboardCandidatesSort) => void;
  onClearSearch: () => void;
  onClearDateFilter: () => void;
}

export function CandidatesTable({
  query,
  search,
  hasDateFilter,
  showEdition,
  sort,
  onSelect,
  onPageChange,
  onSortChange,
  onClearSearch,
  onClearDateFilter,
}: CandidatesTableProps) {
  const { data, isPending, isError, isFetching, refetch } = query;

  if (isPending) return <TableSkeleton />;
  if (isError && !data) return <LoadErrorState what="a lista de inscritos" onRetry={() => refetch()} />;
  if (!data) return null;

  if (data.items.length === 0) {
    return (
      <EmptyState
        search={search}
        hasDateFilter={hasDateFilter}
        onClearSearch={onClearSearch}
        onClearDateFilter={onClearDateFilter}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Desktop: tabela. Mobile: cards — uma linha de tabela com seis
          colunas num celular ou rola de lado ou fica ilegível. */}
      <div className="border-border bg-card hidden overflow-x-auto rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidato</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Semestre</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>
                <SortableSignupDateHeader sort={sort} onSortChange={onSortChange} />
              </TableHead>
              {showEdition && <TableHead>Edição</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`Ver inscrição de ${item.name}`}
                onClick={() => onSelect(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(item);
                  }
                }}
                className="focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={item.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-muted-foreground truncate text-sm">{item.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{COURSE_LABELS[item.course]}</TableCell>
                <TableCell className="tabular-nums">{semesterLabel(item.semester)}</TableCell>
                <TableCell className="tabular-nums">{formatPhone(item.phone)}</TableCell>
                <TableCell className="tabular-nums">{formatDate(item.createdAt)}</TableCell>
                {showEdition && <TableCell>{item.process.label}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {data.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              // 44px de alvo de toque no mobile (FEAT-0007-UI, seção 11).
              className="border-border bg-card hover:bg-accent focus-visible:ring-ring flex min-h-[44px] w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Avatar name={item.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {COURSE_LABELS[item.course]} · {semesterLabel(item.semester)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                  Inscrição em {formatDate(item.createdAt)}
                  {showEdition ? ` · ${item.process.label}` : ""}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <PaginationBar pagination={data.pagination} onPageChange={onPageChange} disabled={isFetching} />
    </div>
  );
}

/**
 * Único cabeçalho clicável da tabela: alterna a ordenação por data de
 * inscrição entre mais recente e mais antiga primeiro (observação do time,
 * 2026-08-21). A seta indica a direção ATUAL, não a que o clique vai
 * produzir — mesma convenção de qualquer cabeçalho ordenável.
 */
function SortableSignupDateHeader({
  sort,
  onSortChange,
}: {
  sort: DashboardCandidatesSort;
  onSortChange: (sort: DashboardCandidatesSort) => void;
}) {
  const isRecent = sort === "recent";

  return (
    <button
      type="button"
      onClick={() => onSortChange(isRecent ? "oldest" : "recent")}
      className="hover:text-foreground focus-visible:ring-ring -m-2 flex items-center gap-1 rounded p-2 focus-visible:ring-2 focus-visible:outline-none"
      aria-label={`Inscrição — ordenado por ${isRecent ? "mais recente" : "mais antiga"} primeiro. Clique para inverter.`}
    >
      Inscrição
      {isRecent ? (
        <ArrowDownIcon className="size-3.5" aria-hidden />
      ) : (
        <ArrowUpIcon className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
    >
      {initialsOf(name)}
    </span>
  );
}

function EmptyState({
  search,
  hasDateFilter,
  onClearSearch,
  onClearDateFilter,
}: {
  search: string;
  hasDateFilter: boolean;
  onClearSearch: () => void;
  onClearDateFilter: () => void;
}) {
  if (search) {
    return (
      <StateMessage
        compact
        icon={<SearchXIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Nenhum candidato encontrado."
        description={`Não encontramos ninguém para "${search}". Confira a grafia ou tente outro termo.`}
        action={{ label: "Limpar busca", onClick: onClearSearch }}
      />
    );
  }

  if (hasDateFilter) {
    // Copy própria porque a causa não está à vista: edição e intervalo são
    // dois recortes temporais sobrepostos, e escolher 2026.1 com datas de
    // agosto devolve vazio corretamente (FEAT-0007, E8). Sem dizer isso, a
    // pessoa conclui que não há inscritos — e a tela terá mentido por omissão.
    return (
      <StateMessage
        compact
        icon={<CalendarOffIcon className="text-muted-foreground size-8" aria-hidden />}
        title="Nenhuma inscrição no período selecionado."
        description="Verifique se o intervalo de datas está dentro da edição escolhida — cada edição cobre só um semestre."
        action={{ label: "Limpar período", onClick: onClearDateFilter }}
      />
    );
  }

  return (
    <StateMessage
      compact
      icon={<UsersIcon className="text-muted-foreground size-8" aria-hidden />}
      title="Nenhuma inscrição nesta edição ainda."
      description="Assim que alguém se inscrever, aparece aqui."
    />
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando inscritos">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-[72px] w-full rounded-xl" />
      ))}
    </div>
  );
}
