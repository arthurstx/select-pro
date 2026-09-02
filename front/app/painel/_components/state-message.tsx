"use client";

import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface StateMessageProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  /** Menos respiro quando a mensagem substitui só o corpo da tabela. */
  compact?: boolean;
}

/** Caixa de estado vazio/erro — mesmo desenho do check-in (`candidate-list.tsx`). */
export function StateMessage({ icon, title, description, action, compact }: StateMessageProps) {
  return (
    <div
      className={`border-border bg-card flex flex-col items-center gap-3 rounded-xl border text-center ${
        compact ? "py-10" : "py-16"
      }`}
    >
      {icon}
      <div className="px-6">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      {action && (
        <Button type="button" variant="outline" size="sm" onClick={action.onClick}>
          <RefreshCwIcon aria-hidden />
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function LoadErrorState({
  onRetry,
  what,
  compact,
}: {
  onRetry: () => void;
  what: string;
  compact?: boolean;
}) {
  return (
    <StateMessage
      compact={compact}
      icon={<CircleAlertIcon className="text-destructive size-8" aria-hidden />}
      title={`Não foi possível carregar ${what}.`}
      description="Verifique sua conexão e tente novamente."
      action={{ label: "Tentar novamente", onClick: onRetry }}
    />
  );
}
