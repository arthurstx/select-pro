"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface AuthRadioCardOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

interface AuthRadioCardsProps<T extends string> {
  name: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly AuthRadioCardOption<T>[];
  "aria-invalid"?: boolean;
}

/**
 * Cartão selecionável = `Label` + `RadioGroupItem`, mesmo padrão de
 * `front/app/inscricao/_components/referral-step-form.tsx` — o projeto não
 * tem `tabs`/`toggle-group` nem um componente de "card selecionável"
 * pronto, então essa composição é o jeito certo de fazer 3 opções visíveis
 * sem introduzir um componente shadcn novo. Usada pela tela de cadastro
 * (FEAT-0008, emenda 2026-09-04) para escolher Efetivo/Trainee/Pós-júnior.
 */
export function AuthRadioCards<T extends string>({
  name,
  value,
  onValueChange,
  options,
  "aria-invalid": ariaInvalid,
}: AuthRadioCardsProps<T>) {
  return (
    <RadioGroup value={value} onValueChange={(next: string) => onValueChange(next as T)} aria-invalid={ariaInvalid}>
      {options.map((option) => (
        <Label
          key={option.value}
          htmlFor={`${name}-${option.value}`}
          className={cn(
            "border-input has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5",
            "flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm font-normal",
          )}
        >
          <RadioGroupItem value={option.value} id={`${name}-${option.value}`} className="mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground font-medium">{option.label}</span>
            <span className="text-muted-foreground text-xs leading-relaxed">{option.description}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
