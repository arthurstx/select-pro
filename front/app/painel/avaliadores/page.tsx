"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { MEMBER_STATUS_LABELS, type EvaluatorRole, type EvaluatorRoleFilter } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listEvaluators, setEvaluatorRole } from "@/lib/evaluators/evaluators-api";
import { cn } from "@/lib/utils";

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
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["evaluators", roleFilter],
    queryFn: () => listEvaluators(roleFilter),
  });

  // Contagem por cargo, sempre sobre a lista inteira — independe do `roleFilter` ativo
  // (senão o contador mudaria de número dependendo da aba selecionada). Mesma query key
  // de `roleFilter === "all"`, então quando ele já está selecionado não duplica round-trip.
  const allQuery = useQuery({
    queryKey: ["evaluators", "all"],
    queryFn: () => listEvaluators("all"),
  });
  const evaluatorCount = allQuery.data?.filter((e) => e.role === "avaliador").length ?? 0;
  const hostCount = allQuery.data?.filter((e) => e.role === "host").length ?? 0;

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: EvaluatorRole }) => setEvaluatorRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evaluators"] }),
  });

  // Sem paginação (dezenas de avaliadores, não milhares) — busca filtra a lista já
  // carregada, no cliente, sem round-trip à API (mesmo padrão de check-in-membros).
  const filteredEvaluators = useMemo(() => {
    if (!query.data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return query.data;

    return query.data.filter((evaluator) => evaluator.name.toLowerCase().includes(term));
  }, [query.data, search]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Avaliadores</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cargo na edição corrente do processo seletivo. Alterar aqui não afeta edições anteriores.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1.5 py-1.5 text-sm font-medium">
            {evaluatorCount} avaliador{evaluatorCount === 1 ? "" : "es"}
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1.5 text-sm font-medium">
            {hostCount} host{hostCount === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      <div className="relative w-full md:w-[400px]">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar avaliador pelo nome…"
          className="pl-9"
          aria-label="Buscar avaliador pelo nome"
        />
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

      {query.isSuccess && query.data.length > 0 && filteredEvaluators.length === 0 && (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <SearchIcon className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground text-sm">Nenhum avaliador encontrado para &ldquo;{search}&rdquo;.</p>
        </div>
      )}

      {query.isSuccess && filteredEvaluators.length > 0 && (
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
              {filteredEvaluators.map((evaluator) => {
                const isHost = evaluator.role === "host";
                const isPending =
                  roleMutation.isPending && roleMutation.variables?.userId === evaluator.userId;

                return (
                  <TableRow key={evaluator.userId}>
                    <TableCell className="font-medium">{evaluator.name}</TableCell>
                    <TableCell className="text-muted-foreground">{evaluator.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{MEMBER_STATUS_LABELS[evaluator.memberStatus]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isHost ? "default" : "outline"}>{isHost ? "Host" : "Avaliador"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={isHost ? "ghost" : "destructive"}
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
