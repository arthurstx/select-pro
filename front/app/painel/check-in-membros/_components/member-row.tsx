"use client";

import { CheckIcon, UndoIcon } from "lucide-react";
import { toast } from "sonner";
import type { MemberCheckinItem } from "shared";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useMarkMemberPresentMutation, useUnmarkMemberPresentMutation } from "@/lib/member-checkin/queries";

interface MemberRowProps {
  member: MemberCheckinItem;
}

/** Uma linha da lista — mesmo desenho de `check-in/_components/candidate-row.tsx`, sem email/telefone (não fazem parte do contrato de membro). */
export function MemberRow({ member }: MemberRowProps) {
  const markPresent = useMarkMemberPresentMutation();
  const unmarkPresent = useUnmarkMemberPresentMutation();

  const present = member.checkedInAt !== null;
  const pending = markPresent.isPending || unmarkPresent.isPending;

  function handleMark() {
    markPresent.mutate(member.userId, {
      onSuccess: () => {
        toast.success(`Presença de ${member.name} confirmada.`, {
          action: { label: "Desfazer", onClick: () => unmarkPresent.mutate(member.userId) },
        });
      },
      onError: () => toast.error(`Não foi possível confirmar a presença de ${member.name}.`),
    });
  }

  function handleUnmark() {
    unmarkPresent.mutate(member.userId, {
      onError: () => toast.error(`Não foi possível desmarcar a presença de ${member.name}.`),
    });
  }

  return (
    <article className="bg-card border-border flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md md:h-[72px] md:px-6">
      <Avatar name={member.name} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold">{member.name}</h3>
        <p className="text-muted-foreground truncate text-sm">{member.email}</p>
      </div>
      <RoleBadge role={member.role} />
      <StatusBadge present={present} />
      <div className="w-40 shrink-0">
        <ActionButton present={present} pending={pending} onMark={handleMark} onUnmark={handleUnmark} />
      </div>
    </article>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = initialsOf(name);
  return (
    <div
      className="bg-muted text-muted-foreground border-border flex size-10 shrink-0 items-center justify-center rounded-full border font-semibold"
      aria-hidden
    >
      {initials}
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function RoleBadge({ role }: { role: MemberCheckinItem["role"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase",
        role === "host" ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border",
      )}
    >
      {role === "host" ? "Host" : "Avaliador"}
    </span>
  );
}

function StatusBadge({ present }: { present: boolean }) {
  return (
    <span
      className={cn(
        "hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase sm:inline-block",
        present ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border",
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
}: {
  present: boolean;
  pending: boolean;
  onMark: () => void;
  onUnmark: () => void;
}) {
  if (present) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onUnmark} className="w-full rounded-full">
        {pending ? <Spinner aria-hidden /> : <UndoIcon aria-hidden />}
        Desmarcar
      </Button>
    );
  }

  return (
    <Button type="button" size="sm" disabled={pending} onClick={onMark} className="w-full rounded-full">
      {pending ? <Spinner aria-hidden /> : <CheckIcon aria-hidden />}
      Marcar presença
    </Button>
  );
}
