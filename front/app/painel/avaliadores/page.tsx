"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { useState } from "react";
import type { EvaluatorRole, EvaluatorRoleFilter, MemberStatus } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listEvaluators, setEvaluatorRole } from "@/lib/evaluators/evaluators-api";
import { cn } from "@/lib/utils";

const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Efetivado",
  inactive: "Pós-júnior",
  trainee: "Trainee",
};

const ROLE_FILTER_OPTIONS: { value: EvaluatorRoleFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "avaliador", label: "Avaliadores" },
  { value: "host", label: "Hosts" },
];

/**
 * Gestão de avaliadores (FEAT-0009) — toggle avaliador↔host e filtro por
 * cargo, os dois escopados à edição corrente do processo seletivo (D4). A
 * situação do membro (FR-002) só dá contexto ao admin; não é editável aqui.
 */
export default function AvaliadoresPage() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<EvaluatorRoleFilter>("all");

  const query = useQuery({
    queryKey: ["evaluators", roleFilter],
    queryFn: () => listEvaluators(roleFilter),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: EvaluatorRole }) => setEvaluatorRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evaluators"] }),
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Avaliadores</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cargo na edição corrente do processo seletivo. Alterar aqui não afeta edições anteriores.
        </p>
      </div>

      <div role="group" aria-label="Filtrar por cargo" className="flex items-center gap-2 overflow-x-auto pb-1">
        {ROLE_FILTER_OPTIONS.map((option) => {
          const active = option.value === roleFilter;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setRoleFilter(option.value)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-transparent border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {option.label}
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
          Não foi possível carregar os avaliadores. Tente novamente.
        </p>
      )}

      {query.isSuccess && query.data.length === 0 && (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <UsersIcon className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground text-sm">Nenhum avaliador encontrado para este filtro.</p>
        </div>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="border-border overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((evaluator) => {
                const isHost = evaluator.role === "host";
                const isPending =
                  roleMutation.isPending && roleMutation.variables?.userId === evaluator.userId;

                return (
                  <TableRow key={evaluator.userId}>
                    <TableCell className="font-medium">{evaluator.name}</TableCell>
                    <TableCell className="text-muted-foreground">{evaluator.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{MEMBER_STATUS_LABEL[evaluator.memberStatus]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isHost ? "default" : "outline"}>{isHost ? "Host" : "Avaliador"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          roleMutation.mutate({
                            userId: evaluator.userId,
                            role: isHost ? "avaliador" : "host",
                          })
                        }
                      >
                        {isPending ? <Spinner aria-hidden /> : isHost ? "Rebaixar a avaliador" : "Promover a host"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {roleMutation.isError && (
        <p className="text-destructive text-sm" role="alert">
          Não foi possível alterar o cargo. Tente novamente.
        </p>
      )}
    </div>
  );
}
