"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRegistration } from "../_context/registration-context";
import { isStepComplete } from "../_lib/wizard-guards";
import type { WizardStepNumber } from "../_lib/wizard-steps";

/**
 * Redireciona para `/inscricao` se alguma etapa anterior a `step` não tiver
 * sido preenchida (acesso direto via URL, por exemplo) — mesma guarda usada
 * hoje em `verificar/page.tsx`. Espera a hidratação do sessionStorage
 * (`isHydrated`) antes de decidir, para não redirecionar por engano logo
 * após um F5 que ainda não terminou de carregar as respostas salvas.
 */
export function useWizardGuard(step: WizardStepNumber): boolean {
  const router = useRouter();
  const { answers, isHydrated } = useRegistration();

  useEffect(() => {
    if (!isHydrated) return;

    for (let previous = 1; previous < step; previous++) {
      if (!isStepComplete(answers, previous as WizardStepNumber)) {
        router.replace("/inscricao");
        return;
      }
    }
  }, [isHydrated, answers, step, router]);

  return isHydrated;
}
