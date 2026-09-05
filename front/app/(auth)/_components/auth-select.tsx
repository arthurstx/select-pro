"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuthSelectOption {
  value: string;
  label: string;
}

interface AuthSelectProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: readonly AuthSelectOption[];
  "aria-invalid"?: boolean;
}

/**
 * Wrapper fino sobre `Select` — evita repetir o mesmo bloco
 * `Select/SelectTrigger/SelectContent/SelectItem` 4 vezes no cadastro
 * auto-declarado (curso, semestre, gênero, etnia). Mesmo padrão de uso de
 * `front/app/inscricao/_components/candidate-registration-form.tsx`, só
 * que parametrizado. Quem usa envolve isto num `Controller` do RHF — este
 * componente não conhece formulário, só recebe `value`/`onValueChange`.
 */
export function AuthSelect({ id, value, onValueChange, placeholder, options, ...rest }: AuthSelectProps) {
  return (
    <Select value={value || ""} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-invalid={rest["aria-invalid"]}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
