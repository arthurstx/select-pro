"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemberCheckinListResponse } from "shared";

import { listMemberCheckins, markMemberPresent, unmarkMemberPresent } from "./api";

/** Chave única — sem paginação/filtro (plan.md: dezenas de pessoas por edição, não milhares). */
const LIST_KEY = ["member-checkins"] as const;

type ListData = MemberCheckinListResponse["data"];

export function useMemberCheckinsQuery() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: listMemberCheckins,
    // Mesma razão de `useCandidatesQuery` (lib/checkin/queries.ts): lista
    // operacional e concorrente, nunca considerada fresca.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

function patchItem(data: ListData, userId: string, checkedInAt: string | null): ListData {
  const items = data.items.map((item) => (item.userId === userId ? { ...item, checkedInAt } : item));
  const checkedIn = items.filter((item) => item.checkedInAt !== null).length;

  return { ...data, items, summary: { ...data.summary, checkedIn } };
}

/** Marcar presença. Otimista — a linha pinta antes da resposta do servidor, mesmo padrão de `useMarkPresentMutation` (candidatos). */
export function useMarkMemberPresentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => markMemberPresent(userId),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const snapshot = queryClient.getQueryData<ListData>(LIST_KEY);
      if (snapshot) queryClient.setQueryData(LIST_KEY, patchItem(snapshot, userId, new Date().toISOString()));
      return { snapshot };
    },
    onError: (_error, _userId, context) => {
      if (context?.snapshot) queryClient.setQueryData(LIST_KEY, context.snapshot);
    },
    onSuccess: (result) => {
      // Reconcilia com o `checkedInAt` real do servidor — idempotência
      // devolve o da confirmação ORIGINAL, não o instante deste clique.
      const current = queryClient.getQueryData<ListData>(LIST_KEY);
      if (current) queryClient.setQueryData(LIST_KEY, patchItem(current, result.userId, result.checkedInAt));
    },
  });
}

/** Desmarcar presença. Mesmo desenho otimista, invertido. */
export function useUnmarkMemberPresentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => unmarkMemberPresent(userId),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const snapshot = queryClient.getQueryData<ListData>(LIST_KEY);
      if (snapshot) queryClient.setQueryData(LIST_KEY, patchItem(snapshot, userId, null));
      return { snapshot };
    },
    onError: (_error, _userId, context) => {
      if (context?.snapshot) queryClient.setQueryData(LIST_KEY, context.snapshot);
    },
  });
}
