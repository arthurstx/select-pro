import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { WIZARD_STEPS, type WizardStepNumber } from "../_lib/wizard-steps";

/**
 * Indicador de progresso do wizard (FEAT-0001-UI v2.0, seção 3): os 6 passos
 * numerados, com check nos concluídos. É decoração/orientação — não captura
 * dado, então não precisa de nenhuma lógica de formulário.
 */
export function WizardStepper({ current }: { current: WizardStepNumber }) {
  return (
    <ol className="flex w-full items-start" aria-label="Progresso da inscrição">
      {WIZARD_STEPS.map(({ number, label }) => {
        const isCompleted = number < current;
        const isCurrent = number === current;

        return (
          <li key={number} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:size-8 sm:text-sm",
                  (isCompleted || isCurrent) && "bg-primary text-primary-foreground",
                  !isCompleted && !isCurrent && "border-border bg-background text-muted-foreground border",
                )}
              >
                {isCompleted ? <CheckIcon className="size-4" /> : number}
              </div>
              {number < WIZARD_STEPS.length && (
                <div className={cn("h-0.5 flex-1", isCompleted ? "bg-primary" : "bg-border")} />
              )}
            </div>
            <span
              className={cn(
                "mt-2 hidden text-center text-[11px] leading-tight text-balance sm:block",
                isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
