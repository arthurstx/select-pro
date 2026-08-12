"use client";

import { CheckIcon, MailIcon, PhoneIcon, UndoIcon } from "lucide-react";
import { toast } from "sonner";
import { COURSE_LABELS, type CandidateCheckinItem } from "shared";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useMarkPresentMutation, useUnmarkPresentMutation } from "@/lib/checkin/queries";

import { initialsOf, semesterLabel } from "../_lib/format";

interface CandidateRowProps {
  candidate: CandidateCheckinItem;
}

/**
 * Uma linha (desktop) / um card (mobile) da lista. Cada linha chama suas
 * próprias mutações — não uma só compartilhada pela página inteira — porque
 * o estado "em envio" precisa ser por linha: as demais continuam clicáveis
 * enquanto uma está em voo (FEAT-0005-UI, seção 5).
 */
export function CandidateRow({ candidate }: CandidateRowProps) {
  const markPresent = useMarkPresentMutation();
  const unmarkPresent = useUnmarkPresentMutation();

  const present = candidate.checkedInAt !== null;
  const pending = markPresent.isPending || unmarkPresent.isPending;

  function handleMark() {
    markPresent.mutate(candidate.id, {
      onSuccess: () => {
        // Confirmação com desfazer — a rede de segurança do toque errado,
        // preferível a um diálogo de confirmação que custaria um toque a
        // mais em cada marcação certa (FEAT-0005-UI, seção 12).
        toast.success(`Presença de ${candidate.name} confirmada.`, {
          action: {
            label: "Desfazer",
            onClick: () => unmarkPresent.mutate(candidate.id),
          },
        });
      },
      onError: () => {
        toast.error(`Não foi possível confirmar a presença de ${candidate.name}.`);
      },
    });
  }

  function handleUnmark() {
    unmarkPresent.mutate(candidate.id, {
      onError: () => {
        toast.error(`Não foi possível desmarcar a presença de ${candidate.name}.`);
      },
    });
  }

  const courseAndSemester = `${COURSE_LABELS[candidate.course]} · ${semesterLabel(candidate.semester)}`;

  return (
    <article className="bg-card border-border rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md md:flex md:h-[72px] md:items-center md:p-0 md:px-6">
      {/* Mobile — card vertical */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          {/*
            `min-w-0` também aqui, não só no bloco de texto: sem isso, este
            wrapper (ele mesmo um item flex da linha `justify-between`) não
            aceita encolher abaixo do conteúdo, o `truncate` do nome não tem
            efeito, e a badge é empurrada para fora do card em nomes longos.
          */}
          <div className="flex min-w-0 flex-1 gap-3">
            <Avatar name={candidate.name} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="truncate text-base leading-tight font-semibold">{candidate.name}</h3>
              <p className="text-muted-foreground truncate text-sm">{courseAndSemester}</p>
            </div>
          </div>
          <StatusBadge present={present} />
        </div>
        <div className="text-muted-foreground flex flex-col gap-1 pl-[52px] text-sm">
          <span className="flex items-center gap-2 truncate">
            <MailIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{candidate.email}</span>
          </span>
          <span className="flex items-center gap-2">
            <PhoneIcon className="size-4 shrink-0" aria-hidden />
            {candidate.phone}
          </span>
        </div>
        <ActionButton present={present} pending={pending} onMark={handleMark} onUnmark={handleUnmark} className="h-11 w-full" />
      </div>

      {/* Desktop — linha horizontal */}
      <div className="hidden md:flex md:w-full md:items-center">
        <Avatar name={candidate.name} className="size-12" />
        <div className="ml-4 min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{candidate.name}</h3>
          <p className="text-muted-foreground truncate text-sm">{courseAndSemester}</p>
        </div>
        <div className="border-border mx-4 hidden min-w-0 flex-1 flex-col justify-center border-r border-l px-4 lg:flex">
          <p className="text-muted-foreground truncate text-sm">{candidate.email}</p>
          <p className="text-muted-foreground truncate text-sm">{candidate.phone}</p>
        </div>
        <div className="flex w-32 shrink-0 justify-center">
          <StatusBadge present={present} />
        </div>
        <div className="ml-4 w-40 shrink-0">
          <ActionButton present={present} pending={pending} onMark={handleMark} onUnmark={handleUnmark} className="w-full" />
        </div>
      </div>
    </article>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground border-border flex size-10 shrink-0 items-center justify-center rounded-full border font-semibold",
        className,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}

/** Verde de `--success` — token do design system, sem consumidor até esta feature. */
function StatusBadge({ present }: { present: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase",
        present
          ? "bg-success/10 text-success border-success/20"
          : "bg-muted text-muted-foreground border-border",
      )}
    >
      {present ? "Presente" : "Aguardando"}
    </span>
  );
}

function ActionButton({
  present,
  pending,
  onMark,
  onUnmark,
  className,
}: {
  present: boolean;
  pending: boolean;
  onMark: () => void;
  onUnmark: () => void;
  className?: string;
}) {
  if (present) {
    // Desmarcar não é destrutivo — é correção de um toque errado, não
    // exclusão. Botão discreto, sem vermelho de `--destructive`, sem
    // diálogo de confirmação (FEAT-0005-UI, seção 12).
    return (
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onUnmark} className={cn("rounded-full", className)}>
        {pending ? <Spinner aria-hidden /> : <UndoIcon aria-hidden />}
        Desmarcar
      </Button>
    );
  }

  return (
    <Button type="button" size="sm" disabled={pending} onClick={onMark} className={cn("rounded-full", className)}>
      {pending ? <Spinner aria-hidden /> : <CheckIcon aria-hidden />}
      Marcar presença
    </Button>
  );
}
