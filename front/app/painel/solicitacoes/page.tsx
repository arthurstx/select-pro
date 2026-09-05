"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InboxIcon } from "lucide-react";
import { useState } from "react";
import { MEMBER_STATUS_LABELS, ROLES, type SignupRequestStatus, type SignupRequestSummary } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/api-error";
import { decideSignupRequest, listSignupRequests } from "@/lib/auth/auth-api";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

const STATUS_TABS: { value: SignupRequestStatus; label: string }[] = [
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Recusadas" },
];

/**
 * Fila de solicitações de cadastro (FEAT-0008, US3) — funciona sozinha, sem
 * depender do email (FR-021): é a rede de segurança para quando a caixa
 * institucional (gentegestao@) não é monitorada a tempo.
 */
export default function SolicitacoesPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SignupRequestStatus>("pending");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["signup-requests", status],
    queryFn: () => listSignupRequests(status),
    enabled: user?.role === ROLES.ADMIN,
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      decideSignupRequest(id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["signup-requests"] }),
  });

  // Barreira de UX, não de segurança — a real é a API respondendo 403
  // (mesmo espírito do `AuthGuard`, que já documenta essa distinção).
  if (user && user.role !== ROLES.ADMIN) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <p className="text-muted-foreground text-sm">
          Esta página é restrita a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          Solicitações de Cadastro
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pós-juniores e trainees aguardando liberação de acesso.
        </p>
      </div>

      <div role="group" aria-label="Filtrar por status" className="flex items-center gap-2">
        {STATUS_TABS.map((tab) => {
          const active = tab.value === status;
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-transparent border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {query.isPending && (
        <div className="flex items-center justify-center gap-3 py-16" aria-busy="true">
          <Spinner className="text-primary size-5" />
          <p className="text-muted-foreground text-sm">Carregando…</p>
        </div>
      )}

      {query.isError && (
        <p className="text-destructive text-sm" role="alert">
          Não foi possível carregar as solicitações. Tente novamente.
        </p>
      )}

      {query.isSuccess && query.data.length === 0 && (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <InboxIcon className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground text-sm">
            {status === "pending"
              ? "Nenhuma solicitação aguardando."
              : "Nenhuma solicitação por aqui ainda."}
          </p>
        </div>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {query.data.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              showActions={status === "pending"}
              pending={decide.isPending}
              onDecide={(decision) => decide.mutate({ id: request.id, decision })}
              error={
                decide.variables?.id === request.id && decide.isError
                  ? decide.error instanceof ApiError && decide.error.code === "SIGNUP_REQUEST_ALREADY_DECIDED"
                    ? "Já foi decidida por outra pessoa."
                    : "Falhou. Tente de novo."
                  : null
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestRow({
  request,
  showActions,
  pending,
  onDecide,
  error,
}: {
  request: SignupRequestSummary;
  showActions: boolean;
  pending: boolean;
  onDecide: (decision: "approve" | "reject") => void;
  error: string | null;
}) {
  return (
    <li className="bg-card border-border flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-heading text-foreground font-semibold">{request.fullName}</p>
        <p className="text-muted-foreground text-sm">{request.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{MEMBER_STATUS_LABELS[request.memberStatus]}</Badge>
          {request.selfDeclared && (
            <Badge variant="outline" className="text-muted-foreground">
              Dados auto-declarados
            </Badge>
          )}
          <span className="text-muted-foreground text-xs">
            {formatRelativeWait(request.createdAt)}
          </span>
          {request.priorRejectionCount > 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              {request.priorRejectionCount === 1
                ? "1 recusa anterior"
                : `${request.priorRejectionCount} recusas anteriores`}
            </Badge>
          )}
        </div>
        {error && (
          <p className="text-destructive mt-1 text-xs" role="alert">
            {error}
          </p>
        )}
      </div>

      {showActions && (
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onDecide("reject")}>
            Recusar
          </Button>
          <Button size="sm" disabled={pending} onClick={() => onDecide("approve")}>
            Aprovar
          </Button>
        </div>
      )}
    </li>
  );
}

function formatRelativeWait(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours < 1) return "aguardando há poucos minutos";
  if (hours < 24) return `aguardando há ${hours}h`;

  const days = Math.floor(hours / 24);
  return `aguardando há ${days} dia${days > 1 ? "s" : ""}`;
}
