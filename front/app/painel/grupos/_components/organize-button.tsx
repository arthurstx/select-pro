"use client";

import { ShuffleIcon } from "lucide-react";
import { toast } from "sonner";
import { GroupErrorCode } from "shared";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/api-error";
import { useOrganizeGroupsMutation } from "@/lib/group/queries";

/** FR-001/FR-011 — dispara a organização automática, descartando qualquer organização anterior. */
export function OrganizeButton() {
  const organize = useOrganizeGroupsMutation();

  function handleClick() {
    organize.mutate(undefined, {
      onSuccess: (result) => {
        if (result.unallocatedCandidateCount > 0) {
          toast.warning(
            `${result.unallocatedCandidateCount} candidato(s) ficaram sem grupo — capacidade das salas insuficiente.`,
          );
        } else {
          toast.success("Grupos organizados.");
        }
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === GroupErrorCode.NO_CANDIDATES_PRESENT) {
          toast.error("Nenhum candidato fez check-in nesta edição ainda.");
          return;
        }
        if (error instanceof ApiError && error.code === GroupErrorCode.NO_ROOMS_AVAILABLE) {
          toast.error("Não há nenhuma sala cadastrada para organizar os grupos presenciais.");
          return;
        }
        toast.error("Não foi possível organizar os grupos.");
      },
    });
  }

  return (
    <Button type="button" onClick={handleClick} disabled={organize.isPending}>
      {organize.isPending ? <Spinner aria-hidden /> : <ShuffleIcon aria-hidden />}
      Organizar grupos
    </Button>
  );
}
