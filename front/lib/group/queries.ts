"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listGroups, moveCandidate, moveEvaluator, organizeGroups } from "./api";

/**
 * Chave única — sem paginação/filtro (mesmo racional de `member-checkin`:
 * dezenas de grupos por edição, não milhares).
 *
 * Sem atualização otimista aqui — diferente do check-in (um toggle simples
 * por linha), `organize`/`move*` recalculam vários grupos de uma vez; o
 * ganho de latência percebida não compensa reimplementar o algoritmo no
 * cliente. As mutações só invalidam a query em `onSuccess`.
 */
const GROUPS_KEY = ["groups"] as const;

export function useGroupsQuery() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: listGroups,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useOrganizeGroupsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: organizeGroups,
    onSuccess: (result) => {
      queryClient.setQueryData(GROUPS_KEY, { groups: result.groups });
    },
  });
}

export function useMoveCandidateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, candidateId }: { groupId: string; candidateId: string }) => moveCandidate(groupId, candidateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useMoveEvaluatorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => moveEvaluator(groupId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}
