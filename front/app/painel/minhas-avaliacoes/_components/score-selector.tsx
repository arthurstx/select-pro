"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** Escala do contrato (`ScoresSchema` em shared): inteiro de 0 a 5, inclusive. */
const SCORES = [0, 1, 2, 3, 4, 5] as const;

interface ScoreSelectorProps {
  value: number;
  onChange: (value: number) => void;
  /** Id do `FieldLabel` do critério — um radiogroup se nomeia por `aria-labelledby`, não por `htmlFor`. */
  labelledBy: string;
  invalid?: boolean;
}

/**
 * Nota de um critério em blocos clicáveis, no lugar do `input[type=number]` que havia antes.
 * Digitar número num campo é ruim justamente onde esta tela é usada: no celular, durante a
 * dinâmica, com pressa — abre teclado numérico, aceita valor fora da escala e não mostra a
 * escala.
 *
 * Radix `RadioGroup` por baixo, então navegação por setas, `role="radio"` e o estado marcado
 * vêm prontos. Os blocos têm 44px (alvo mínimo de toque) e o valor vive como string na Radix,
 * convertido na fronteira.
 */
export function ScoreSelector({ value, onChange, labelledBy, invalid }: ScoreSelectorProps) {
  return (
    <RadioGroupPrimitive.Root
      value={String(value)}
      onValueChange={(next: string) => onChange(Number(next))}
      orientation="horizontal"
      aria-labelledby={labelledBy}
      aria-invalid={invalid}
      className="flex flex-wrap gap-2"
    >
      {SCORES.map((score) => (
        <RadioGroupPrimitive.Item
          key={score}
          value={String(score)}
          aria-label={`Nota ${score}`}
          className={cn(
            "border-input bg-background text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition-colors outline-none",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground data-[state=checked]:hover:bg-primary",
            invalid && "border-destructive",
          )}
        >
          {score}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
