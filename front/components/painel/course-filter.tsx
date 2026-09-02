"use client";

import { COURSE_LABELS, type Course } from "shared";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Sentinela só para o `Select` do Radix, que não aceita `value=""` num item
 * (FEAT-0015). Nunca sai deste componente: `onValueChange` sempre entrega
 * `Course | undefined` para quem chama, igual ao contrato de query
 * (`course` ausente = todos os cursos).
 */
const ALL_COURSES = "todos" as const;

interface CourseFilterProps {
  /** `undefined` = todos os cursos. */
  value: Course | undefined;
  onValueChange: (course: Course | undefined) => void;
  disabled?: boolean;
}

/**
 * Filtro por curso — componente único, reutilizado no check-in e no
 * dashboard (FEAT-0015). `<select>` em vez de chips: são 8 valores fixos de
 * `CourseSchema`, e chips para 8 opções forçariam rolagem horizontal já no
 * desktop (ver `research.md` da feature, Decisão 3).
 */
export function CourseFilter({ value, onValueChange, disabled }: CourseFilterProps) {
  return (
    <Select
      value={value ?? ALL_COURSES}
      onValueChange={(next: string) => onValueChange(next === ALL_COURSES ? undefined : (next as Course))}
      disabled={disabled}
    >
      <SelectTrigger className="w-full md:w-[220px]" aria-label="Filtrar por curso">
        <SelectValue placeholder="Curso" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_COURSES}>Todos os cursos</SelectItem>
        {(Object.entries(COURSE_LABELS) as [Course, string][]).map(([course, label]) => (
          <SelectItem key={course} value={course}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
