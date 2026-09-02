"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import { ROLES, type MemberStatus } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/api-error";
import { decideSignupRequest, getSignupRequestByToken } from "@/lib/auth/auth-api";
import { useAuth } from "@/lib/auth/auth-context";
import { AUTH_ROUTES } from "@/lib/auth/routes";

import { AuthCard } from "../../_components/auth-card";
import { AuthNoticeAlert } from "../../_components/auth-alert";

const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Efetivado",
  inactive: "Pós-júnior",
  trainee: "Trainee",
};

/**
 * Destino do link do email (FEAT-0008, US2). A leitura é pública (FR-007);
 * a decisão exige admin autenticado (research.md da 008, R2) — só isso
 * satisfaz "registro de autor sem exceção" (SC-005) numa caixa de email
 * compartilhada.
 */
export function SignupDecisionScreen({ token }: { token: string }) {
  const { status: authStatus, user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["signup-request", token],
    queryFn: () => getSignupRequestByToken(token),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") => decideSignupRequest(query.data!.id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["signup-request", token] }),
  });

  if (query.isPending) {
    return (
      <AuthCard title="Solicitação de acesso">
        <div className="flex items-center justify-center gap-3 py-6" aria-busy="true">
          <Spinner className="text-primary size-5" />
          <p className="text-muted-foreground text-sm">Carregando…</p>
        </div>
      </AuthCard>
    );
  }

  if (query.isError) {
    const notFoundOrExpired =
      query.error instanceof ApiError &&
      ["SIGNUP_REQUEST_NOT_FOUND", "SIGNUP_REQUEST_EXPIRED"].includes(query.error.code);

    return (
      <AuthCard title="Link inválido">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="bg-muted flex size-14 items-center justify-center rounded-full">
            <AlertTriangleIcon className="text-muted-foreground size-6" aria-hidden />
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {notFoundOrExpired
              ? "Este link não existe mais ou já expirou (ele vale por 7 dias). A solicitação continua disponível no painel administrativo."
              : "Não foi possível carregar esta solicitação. Tente novamente em alguns instantes."}
          </p>
          <Button asChild variant="outline">
            <Link href={AUTH_ROUTES.login}>Ir para o painel</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const request = query.data;

  // US2, cenário 4: solicitação já decidida — sem botões, só o resultado.
  if (request.status !== "pending") {
    return (
      <AuthCard title="Solicitação já resolvida">
        <div className="flex flex-col gap-4">
          <RequestSummary request={request} />
          <AuthNoticeAlert>
            {request.status === "approved"
              ? "Esta solicitação já foi aprovada."
              : "Esta solicitação já foi recusada."}
          </AuthNoticeAlert>
        </div>
      </AuthCard>
    );
  }

  const isAdmin = authStatus === "authenticated" && user?.role === ROLES.ADMIN;

  return (
    <AuthCard title="Solicitação de acesso" description="Nenhuma decisão foi registrada até agora.">
      <div className="flex flex-col gap-6">
        <RequestSummary request={request} />

        {!isAdmin && (
          <div className="border-border bg-muted/50 rounded-lg border p-4 text-center">
            <p className="text-muted-foreground text-sm leading-relaxed">
              {authStatus === "loading"
                ? "Verificando sua sessão…"
                : "Entre com sua conta de administrador para aprovar ou recusar."}
            </p>
            {authStatus !== "loading" && (
              <Button asChild variant="outline" className="mt-3">
                <Link href={AUTH_ROUTES.login}>Entrar</Link>
              </Button>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="flex flex-col gap-3">
            {decide.isError && (
              <p className="text-destructive text-sm" role="alert">
                {decide.error instanceof ApiError && decide.error.code === "SIGNUP_REQUEST_ALREADY_DECIDED"
                  ? "Esta solicitação acabou de ser decidida por outra pessoa."
                  : "Não foi possível registrar a decisão. Tente novamente."}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                disabled={decide.isPending}
                onClick={() => decide.mutate("reject")}
              >
                Recusar
              </Button>
              <Button size="lg" disabled={decide.isPending} onClick={() => decide.mutate("approve")}>
                {decide.isPending ? <Spinner aria-hidden /> : "Aprovar acesso"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        Este link vale por 7 dias. Você também pode decidir pelo painel administrativo.
      </p>
    </AuthCard>
  );
}

function RequestSummary({
  request,
}: {
  request: { fullName: string; email: string; memberStatus: MemberStatus; priorRejectionCount: number };
}) {
  return (
    <div>
      <p className="font-heading text-foreground text-lg font-semibold">{request.fullName}</p>
      <p className="text-muted-foreground text-sm">{request.email}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{MEMBER_STATUS_LABEL[request.memberStatus]}</Badge>
        {request.priorRejectionCount > 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            {request.priorRejectionCount === 1
              ? "1 solicitação recusada anteriormente"
              : `${request.priorRejectionCount} solicitações recusadas anteriormente`}
          </Badge>
        )}
      </div>
    </div>
  );
}
