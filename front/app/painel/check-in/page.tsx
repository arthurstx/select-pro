"use client";

import { useEffect, useState } from "react";
import type { CheckinStatusFilter } from "shared";

import { useCandidatesQuery } from "@/lib/checkin/queries";

import { CandidateList } from "./_components/candidate-list";
import { FiltersBar } from "./_components/filters-bar";

const PER_PAGE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface Filters {
  page: number;
  search: string;
  status: CheckinStatusFilter;
}

export default function CheckInPage() {
  // Valor bruto digitado — atualiza a cada tecla, sem participar da query.
  const [searchInput, setSearchInput] = useState("");

  // O que de fato compõe a chave da query. `page` só muda aqui, nunca num
  // efeito separado que observe `search`/`status`: resetar depois faria a
  // query disparar duas vezes — uma com a página velha, outra com a
  // corrigida (FEAT-0005-UI, seção 4.4/8.4).
  const [filters, setFilters] = useState<Filters>({ page: 1, search: "", status: "todos" });

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput ? current : { ...current, search: searchInput, page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchInput]);

  function handleStatusChange(status: CheckinStatusFilter) {
    setFilters((current) => (current.status === status ? current : { ...current, status, page: 1 }));
  }

  function handlePageChange(page: number) {
    setFilters((current) => ({ ...current, page }));
  }

  const query = useCandidatesQuery({
    page: filters.page,
    per_page: PER_PAGE,
    status: filters.status,
    search: filters.search || undefined,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Check-in de Candidatos</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Confirme a presença dos candidatos inscritos no processo seletivo
          {query.data ? ` ${query.data.process.label}` : ""}.
        </p>
      </div>

      <FiltersBar
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        status={filters.status}
        onStatusChange={handleStatusChange}
        disabled={query.isPending}
      />

      <CandidateList query={query} search={filters.search} status={filters.status} onPageChange={handlePageChange} />
    </div>
  );
}
