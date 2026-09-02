"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  assignEvaluatorOnline,
  clearOnlineOrganization,
  clearPresencialOrganization,
  joinOnlineGroup,
  leaveOnlineGroup,
  listGroups,
  moveCandidate,
  moveEvaluator,
  organizeOnline,
  organizePresencial,
  previewOnline,
  previewPresencial,
} from "./api";

/**
 * Chave única — sem paginação/filtro (mesmo racional de `member-checkin`:
 * dezenas de grupos por edição, não milhares).
 *
 * FEAT-0018: `organizePresencial`/`organizeOnline` devolvem só os grupos da própria
 * modalidade (não a edição inteira) — por isso as mutações de organizar invalidam a query em
 * vez de `setQueryData` sobrescrevendo a lista inteira (isso apagaria a outra modalidade do
 * cache até o próximo refetch).
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

/** FEAT-0021 — chamada só de dentro do modal de simulação ("Aprovar simulação e organizar grupos"). */
export function useOrganizePresencialMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (evaluatorUserIds?: string[]) => organizePresencial(evaluatorUserIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/** FEAT-0021 (US1) — só leitura/cálculo, nunca invalida `GROUPS_KEY` (nada muda de verdade). */
export function usePreviewPresencialMutation() {
  return useMutation({
    mutationFn: (evaluatorUserIds?: string[]) => previewPresencial(evaluatorUserIds),
  });
}

/** FEAT-0021 (US2) — "Limpar organização". */
export function useClearPresencialOrganizationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearPresencialOrganization,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/** FEAT-0022 — "Limpar organização" no online. */
export function useClearOnlineOrganizationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearOnlineOrganization,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useOrganizeOnlineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: organizeOnline,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/** FEAT-0022 (US4) — só leitura/cálculo, nunca invalida `GROUPS_KEY` (nada muda de verdade). */
export function usePreviewOnlineMutation() {
  return useMutation({ mutationFn: previewOnline });
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

/** FEAT-0018, US2 — self-service. */
export function useJoinOnlineGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => joinOnlineGroup(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/** FEAT-0018, US2 — self-service. */
export function useLeaveOnlineGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leaveOnlineGroup,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/** FEAT-0018, US3 — atribuição manual do admin. */
export function useAssignEvaluatorOnlineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => assignEvaluatorOnline(groupId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}
