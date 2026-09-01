"use client";

import { CalculatorIcon, UsersRoundIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { GroupSummary } from "shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useGroupsQuery, useOrganizeOnlineMutation, usePreviewOnlineMutation } from "@/lib/group/queries";

import { GenderBadge } from "./gender-badge";

/**
 * FEAT-0022 (US4) — mesmo conceito de simular-antes-de-aplicar do presencial (FEAT-0021),
 * mas sem seção de avaliador: o algoritmo automático do online nunca atribui avaliador
 * (FR-015) — a atribuição continua exclusivamente manual (self-service do avaliador ou
 * atribuição do admin, FEAT-0018), coexistindo sem mudança com esta simulação (research.md D6).
 */
export function SimulateOnlineOrganizeModal() {
  const [open, setOpen] = useState(false);
  const preview = usePreviewOnlineMutation();
  const organize = useOrganizeOnlineMutation();
  const groupsQuery = useGroupsQuery();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      preview.mutate(undefined, {
        onError: () => toast.error("Não foi possível calcular a simulação."),
      });
    }
  }

  /**
   * FEAT-0022 (FR-016) — quantos avaliadores estão atribuídos hoje a grupos online reais.
   * Aprovar a simulação substitui esses grupos (mesmo comportamento de `organizeOnline` já
   * existente), soltando essas atribuições — calculado do cache já carregado pela tela de
   * grupos online (`useGroupsQuery`), sem round-trip novo (research.md D8).
   */
  const evaluatorsAtRisk = useMemo(() => {
    const onlineGroups = groupsQuery.data?.groups.filter((g) => g.modality === "online") ?? [];
    return new Set(onlineGroups.flatMap((g) => g.evaluators.map((e) => e.userId))).size;
  }, [groupsQuery.data]);

  function handleApprove() {
    if (evaluatorsAtRisk > 0) {
      const confirmed = window.confirm(
        `${evaluatorsAtRisk} avaliador(es) já atribuído(s) aos grupos online atuais perderão essa atribuição ao aprovar. Continuar?`,
      );
      if (!confirmed) return;
    }
    organize.mutate(undefined, {
      onSuccess: () => {
        toast.success("Grupos online organizados.");
        handleOpenChange(false);
      },
      onError: () => toast.error("Não foi possível organizar os grupos."),
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CalculatorIcon aria-hidden />
          Simular grupos
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Simular organização dos grupos online</DialogTitle>
          <DialogDescription>
            Nada é aplicado até você clicar em &quot;Aprovar simulação e organizar grupos&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          {preview.isPending && !preview.data ? (
            <div className="flex items-center justify-center gap-3 py-16" aria-busy="true">
              <Spinner className="text-primary size-5" />
              <p className="text-muted-foreground text-sm">Calculando…</p>
            </div>
          ) : preview.isError ? (
            <p className="text-destructive py-8 text-center text-sm" role="alert">
              Não foi possível calcular a simulação. Feche e tente de novo.
            </p>
          ) : preview.data ? (
            <div className="flex flex-col gap-4">
              {evaluatorsAtRisk > 0 && (
                <p className="text-destructive text-sm">
                  {evaluatorsAtRisk} avaliador(es) já atribuído(s) aos grupos online atuais perderão essa atribuição ao
                  aprovar esta simulação.
                </p>
              )}
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <UsersRoundIcon className="size-4" aria-hidden />
                Prévia da distribuição
              </h3>
              {preview.data.groups.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum candidato online presente pra simular.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {preview.data.groups.map((group) => (
                    <PreviewOnlineGroupCard key={group.id} group={group} />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleApprove}
            disabled={!preview.data || preview.data.groups.length === 0 || organize.isPending}
          >
            {organize.isPending ? <Spinner aria-hidden /> : null}
            Aprovar simulação e organizar grupos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewOnlineGroupCard({ group }: { group: GroupSummary }) {
  return (
    <article className="bg-card border-border rounded-xl border p-3 shadow-sm">
      <header className="mb-2">
        <h4 className="font-heading text-sm font-semibold">{group.name}</h4>
        <p className="text-muted-foreground text-xs">
          {group.candidates.length} pessoa{group.candidates.length === 1 ? "" : "s"}
        </p>
      </header>
      <ul className="flex flex-col gap-1">
        {group.candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center gap-1.5 text-sm">
            <span className="truncate">{candidate.name}</span>
            <GenderBadge gender={candidate.gender} />
          </li>
        ))}
        {group.candidates.length === 0 && <li className="text-muted-foreground text-sm">Nenhum candidato.</li>}
      </ul>
    </article>
  );
}
