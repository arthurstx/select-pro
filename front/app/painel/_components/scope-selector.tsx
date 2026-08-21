"use client";

import { ALL_EDITIONS, type DashboardMetricsMode, type SelectionProcessSummary } from "shared";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ScopeSelectorProps {
  editions: SelectionProcessSummary[];
  currentId: string | undefined;
  /** `undefined` = "corrente", resolvida pelo backend — não um id que o front adivinhou. */
  value: string | undefined;
  onValueChange: (value: string) => void;
  mode: DashboardMetricsMode;
  onModeChange: (mode: DashboardMetricsMode) => void;
  loading?: boolean;
}

const MODE_OPTIONS: { value: DashboardMetricsMode; label: string }[] = [
  { value: "sum", label: "Soma" },
  { value: "by_edition", label: "Comparar edições" },
];

/**
 * Recorte da tela: uma edição ou todas. O valor exibido cai para a edição
 * corrente enquanto `value` for `undefined` — assim a primeira requisição sai
 * sem `process_id` (o backend resolve a corrente) e não há um refetch extra
 * quando o catálogo chega.
 */
export function ScopeSelector({
  editions,
  currentId,
  value,
  onValueChange,
  mode,
  onModeChange,
  loading,
}: ScopeSelectorProps) {
  if (loading) return <Skeleton className="h-9 w-[220px] rounded-md" />;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={value ?? currentId ?? ""} onValueChange={onValueChange}>
        <SelectTrigger className="w-[220px]" aria-label="Edição do processo seletivo">
          <SelectValue placeholder="Edição" />
        </SelectTrigger>
        <SelectContent>
          {editions.map((edition) => (
            <SelectItem key={edition.id} value={edition.id}>
              {edition.label}
              {edition.id === currentId ? " (atual)" : ""}
            </SelectItem>
          ))}
          <SelectItem value={ALL_EDITIONS}>Todas as edições</SelectItem>
        </SelectContent>
      </Select>

      {/* Comparar só faz sentido com mais de uma edição na tela. */}
      {value === ALL_EDITIONS && (
        <div role="group" aria-label="Modo de visualização dos agregados" className="flex items-center gap-2">
          {MODE_OPTIONS.map((option) => {
            const active = option.value === mode;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onModeChange(option.value)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-transparent border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
