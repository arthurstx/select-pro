"use client";

import { SearchIcon } from "lucide-react";
import type { CheckinStatusFilter, Course } from "shared";

import { CourseFilter } from "@/components/painel/course-filter";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: CheckinStatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "presentes", label: "Presentes" },
  { value: "ausentes", label: "Ausentes" },
];

interface FiltersBarProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  status: CheckinStatusFilter;
  onStatusChange: (status: CheckinStatusFilter) => void;
  course: Course | undefined;
  onCourseChange: (course: Course | undefined) => void;
  disabled?: boolean;
}

/** Busca + chips de status + filtro de curso — mesma barra em desktop e mobile (o mockup só muda o entorno, não este bloco). */
export function FiltersBar({
  searchInput,
  onSearchInputChange,
  status,
  onStatusChange,
  course,
  onCourseChange,
  disabled,
}: FiltersBarProps) {
  return (
    <div className="bg-card border-border flex flex-col gap-4 rounded-xl border p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="relative w-full md:w-[400px]">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder="Buscar candidato pelo nome…"
          disabled={disabled}
          className="pl-9"
          aria-label="Buscar candidato pelo nome"
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div
          role="group"
          aria-label="Filtrar por status de presença"
          className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0"
        >
          {STATUS_OPTIONS.map((option) => {
            const active = option.value === status;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onStatusChange(option.value)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-60",
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

        <CourseFilter value={course} onValueChange={onCourseChange} disabled={disabled} />
      </div>
    </div>
  );
}
