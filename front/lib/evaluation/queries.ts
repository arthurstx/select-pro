"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubmitEvaluationDTO } from "shared";

import { getAdminCandidateDetail, getAdminCandidates, getMyGroup, submitEvaluation } from "./api";

const MY_GROUP_KEY = ["evaluations", "my-group"] as const;
const ADMIN_CANDIDATES_KEY = ["evaluations", "admin", "candidates"] as const;

export function useMyGroupQuery() {
  return useQuery({
    queryKey: MY_GROUP_KEY,
    queryFn: getMyGroup,
    staleTime: 0,
  });
}

export function useSubmitEvaluationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ candidateId, payload }: { candidateId: string; payload: SubmitEvaluationDTO }) =>
      submitEvaluation(candidateId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_GROUP_KEY });
    },
  });
}

export function useAdminCandidatesQuery() {
  return useQuery({
    queryKey: ADMIN_CANDIDATES_KEY,
    queryFn: getAdminCandidates,
    staleTime: 0,
  });
}

export function useAdminCandidateDetailQuery(candidateId: string | null) {
  return useQuery({
    queryKey: [...ADMIN_CANDIDATES_KEY, candidateId],
    queryFn: () => getAdminCandidateDetail(candidateId!),
    enabled: candidateId !== null,
  });
}
