"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRegistration } from "../_context/registration-context";
import { isStepComplete } from "../_lib/wizard-guards";
import type { WizardStepNumber } from "../_lib/wizard-steps";

/**
 * Redireciona para `/inscricao` se alguma etapa anterior a `step` não tiver
 * sido preenchida (acesso direto via URL, por exemplo). Espera a hidratação
 * do sessionStorage (`isHydrated`) antes de decidir, para não redirecionar
 * por engano logo após um F5 que ainda não terminou de carregar as respostas
 * salvas.
 */
export function useWizardGuard(step: WizardStepNumber): boolean {
  const router = useRouter();
  const { answers, isHydrated, registered } = useRegistration();

  useEffect(() => {
    if (!isHydrated) return;
    // Inscrição já gravada: as respostas do wizard são descartadas de
    // propósito (FEAT-0001-UI v3.0, seção 4.6). Sem esta saída, a limpeza
    // faria o guard ler "etapa 1 incompleta" e mandar o candidato de volta
    // ao início bem no momento em que ele deveria ver a tela de sucesso.
    if (registered) return;

    for (let previous = 1; previous < step; previous++) {
      if (!isStepComplete(answers, previous as WizardStepNumber)) {
        router.replace("/inscricao");
        return;
      }
    }
  }, [isHydrated, registered, answers, step, router]);

  return isHydrated;
}
