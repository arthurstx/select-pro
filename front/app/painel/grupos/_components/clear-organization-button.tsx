"use client";

import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useClearOnlineOrganizationMutation, useClearPresencialOrganizationMutation } from "@/lib/group/queries";

const COPY = {
  presencial: {
    confirm: "Limpar toda a organização presencial? Candidatos, hosts e avaliadores perdem a associação.",
    success: "Organização presencial limpa.",
  },
  online: {
    confirm:
      "Limpar toda a organização online? Candidatos perdem a associação com os grupos, e avaliadores atribuídos (self-service ou manualmente) também perdem essa atribuição.",
    success: "Organização online limpa.",
  },
} as const;

/**
 * FEAT-0021 (US2) — ação destrutiva: remove toda a organização da modalidade (candidatos,
 * avaliadores e hosts perdem associação). `window.confirm()` nativo, mesmo padrão já usado
 * pra excluir sala (FEAT-0011) — sem `AlertDialog` instalado, e suficiente pra ferramenta
 * interna. FEAT-0022 — ganhou `modality`, pra cobrir online também (antes só presencial).
 */
export function ClearOrganizationButton({ modality }: { modality: "presencial" | "online" }) {
  const clearPresencial = useClearPresencialOrganizationMutation();
  const clearOnline = useClearOnlineOrganizationMutation();
  const clear = modality === "presencial" ? clearPresencial : clearOnline;
  const copy = COPY[modality];

  function handleClick() {
    if (!window.confirm(copy.confirm)) return;
    clear.mutate(undefined, {
      onSuccess: () => toast.success(copy.success),
      onError: () => toast.error("Não foi possível limpar a organização."),
    });
  }

  return (
    <Button type="button" variant="destructive" size="sm" disabled={clear.isPending} onClick={handleClick}>
      {clear.isPending ? <Spinner aria-hidden /> : <Trash2Icon aria-hidden />}
      Limpar organização
    </Button>
  );
}
