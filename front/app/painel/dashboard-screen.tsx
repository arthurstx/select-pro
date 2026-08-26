"use client";

import { DownloadIcon, SearchIcon, ServerCrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ALL_EDITIONS,
  CheckinErrorCode,
  type DashboardCandidateItem,
  type DashboardCandidatesSort,
  type DashboardMetricsMode,
} from "shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportCandidatesCsv } from "@/lib/dashboard/export-candidates";
import {
  useCandidateDetailQuery,
  useDashboardCandidatesQuery,
  useDashboardMetricsQuery,
  useEditionsQuery,
} from "@/lib/dashboard/queries";

import { CandidateDetailSheet } from "./_components/candidate-detail-sheet";
import { CandidatesTable } from "./_components/candidates-table";
import { DateRangeFilter, type DateRange } from "./_components/date-range-filter";
import { MetricsPanel } from "./_components/metrics-panel";
import { ScopeSelector } from "./_components/scope-selector";
import { StateMessage } from "./_components/state-message";
import { isApiErrorWithCode, terminalErrorFor } from "./_lib/error-view";

const PER_PAGE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface Filters {
  /** `undefined` = edição corrente, resolvida pelo backend. */
  processId: string | undefined;
  search: string;
  from: string;
  to: string;
  page: number;
  sort: DashboardCandidatesSort;
}

const INITIAL_FILTERS: Filters = {
  processId: undefined,
  search: "",
  from: "",
  to: "",
  page: 1,
  sort: "recent",
};

export function DashboardScreen() {
  const [searchInput, setSearchInput] = useState("");
  const [mode, setMode] = useState<DashboardMetricsMode>("sum");
  const [selected, setSelected] = useState<DashboardCandidateItem | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  /**
   * `page` só muda AQUI, nunca num efeito separado que observe os demais
   * filtros: resetar depois faria a query disparar duas vezes — a primeira
   * com a página errada (FEAT-0005-UI, seção 8.4; FEAT-0007-UI, seção 4.3).
   */
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput ? current : { ...current, search: searchInput, page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchInput]);

  const editionsQuery = useEditionsQuery();

  // Duas queries independentes: os filtros da tabela não tocam nos agregados.
  // Numa requisição única, o gráfico piscaria a cada tecla digitada.
  const metricsQuery = useDashboardMetricsQuery({ process_id: filters.processId, mode });
  const candidatesQuery = useDashboardCandidatesQuery({
    process_id: filters.processId,
    page: filters.page,
    per_page: PER_PAGE,
    search: filters.search || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: filters.sort,
  });
  const detailQuery = useCandidateDetailQuery(selected?.id ?? null);

  /*
   * As duas correções abaixo acontecem DURANTE o render, e não num efeito.
   *
   * É o padrão que o React documenta para ajustar estado quando algo de fora
   * muda: o efeito equivalente funcionaria, mas custaria um render a mais
   * (com a tela mostrando o estado errado nesse meio-tempo) e é exatamente o
   * que a regra `react-hooks/set-state-in-effect` existe para evitar.
   *
   * A guarda `!== last…` é o que impede o laço — sem ela, corrigir o estado
   * dispara outro render, que reencontra o mesmo erro e corrige de novo.
   */

  // Edição inválida no seletor: volta para a corrente, em vez de deixar a
  // tela presa num 404 que o usuário não sabe desfazer.
  const invalidEdition =
    isApiErrorWithCode(metricsQuery.error, CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND) ||
    isApiErrorWithCode(candidatesQuery.error, CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND);
  const [rejectedEdition, setRejectedEdition] = useState<string | null>(null);

  if (invalidEdition && filters.processId && filters.processId !== rejectedEdition) {
    setRejectedEdition(filters.processId);
    setFilters((current) => ({ ...current, processId: undefined, page: 1 }));
    setMode("sum");
  }

  // O painel está olhando alguém que não existe mais.
  const candidateGone = isApiErrorWithCode(detailQuery.error, CheckinErrorCode.CANDIDATE_NOT_FOUND);
  const [goneCandidateId, setGoneCandidateId] = useState<string | null>(null);

  if (candidateGone && selected && selected.id !== goneCandidateId) {
    setGoneCandidateId(selected.id);
    setSelected(null);
  }

  // Os avisos, sim, são efeito: notificar e recarregar são atualizações de
  // sistemas externos (o toaster e o cache do TanStack), que é para o que
  // `useEffect` serve.
  useEffect(() => {
    if (rejectedEdition) toast.error("Essa edição não existe mais. Voltamos para a edição atual.");
  }, [rejectedEdition]);

  const refetchCandidates = candidatesQuery.refetch;

  useEffect(() => {
    if (!goneCandidateId) return;

    toast.error("Esta inscrição não está mais disponível.");
    // A listagem também está desatualizada — ela ainda mostra a linha.
    void refetchCandidates();
  }, [goneCandidateId, refetchCandidates]);

  const terminal = terminalErrorFor(metricsQuery.error) ?? terminalErrorFor(candidatesQuery.error);

  function updateFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
  }

  function handleScopeChange(value: string) {
    updateFilters({ processId: value });
    if (value !== ALL_EDITIONS) setMode("sum");
  }

  function handleDateRangeApply(range: DateRange) {
    updateFilters({ from: range.from, to: range.to });
  }

  function handleClearSearch() {
    setSearchInput("");
    updateFilters({ search: "" });
  }

  function handleSortChange(sort: DashboardCandidatesSort) {
    updateFilters({ sort });
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      await exportCandidatesCsv({
        process_id: filters.processId,
        search: filters.search || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
    } catch {
      toast.error("Não foi possível exportar os candidatos. Tente novamente.");
    } finally {
      setIsExporting(false);
    }
  }

  const scopeLabel =
    metricsQuery.data?.scope.kind === "edition" ? metricsQuery.data.scope.process.label : "todas as edições";
  const hasDateFilter = filters.from !== "" || filters.to !== "";
  const hasAnyFilter = filters.search !== "" || hasDateFilter;

  // Sem nenhuma inscrição na edição E sem filtro ativo, a mensagem do
  // `MetricsPanel` já cobre gráficos e tabela — repeti-la na tabela seria
  // dizer duas vezes a mesma coisa (FEAT-0007-UI, seção 5).
  const emptyEdition = metricsQuery.data?.totals.candidates === 0 && !hasAnyFilter;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
            Painel de Inscrições
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Quem se inscreveu no processo seletivo {scopeLabel} e com que perfil.
          </p>
        </div>

        <ScopeSelector
          editions={editionsQuery.data?.editions ?? []}
          currentId={editionsQuery.data?.current.id}
          value={filters.processId}
          onValueChange={handleScopeChange}
          mode={mode}
          onModeChange={setMode}
          loading={editionsQuery.isPending}
        />
      </header>

      {terminal ? (
        <StateMessage
          icon={<ServerCrashIcon className="text-muted-foreground size-8" aria-hidden />}
          title={terminal.title}
          description={terminal.description}
        />
      ) : (
        <>
          <MetricsPanel query={metricsQuery} />

          {!emptyEdition && (
            <section className="flex flex-col gap-4" aria-label="Inscritos">
              <h2 className="font-heading text-lg font-semibold tracking-tight">Inscritos</h2>

              <div className="bg-card border-border flex flex-col gap-4 rounded-xl border p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:w-[400px]">
                  <SearchIcon
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Buscar candidato pelo nome…"
                    className="pl-9"
                    aria-label="Buscar candidato pelo nome"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <DateRangeFilter value={{ from: filters.from, to: filters.to }} onApply={handleDateRangeApply} />
                  <Button variant="outline" size="sm" disabled={isExporting} onClick={handleExport}>
                    <DownloadIcon aria-hidden />
                    {isExporting ? "Exportando…" : "Exportar CSV"}
                  </Button>
                </div>
              </div>

              <CandidatesTable
                query={candidatesQuery}
                search={filters.search}
                hasDateFilter={hasDateFilter}
                showEdition={filters.processId === ALL_EDITIONS}
                sort={filters.sort}
                onSelect={setSelected}
                onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
                onSortChange={handleSortChange}
                onClearSearch={handleClearSearch}
                onClearDateFilter={() => handleDateRangeApply({ from: "", to: "" })}
              />
            </section>
          )}
        </>
      )}

      <CandidateDetailSheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        fallbackName={selected?.name ?? ""}
        detail={detailQuery.data}
        isPending={detailQuery.isPending}
        isError={detailQuery.isError}
        onRetry={() => void detailQuery.refetch()}
      />
    </div>
  );
}
