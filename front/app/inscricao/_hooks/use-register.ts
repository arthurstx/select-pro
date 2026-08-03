import { useMutation } from "@tanstack/react-query";

import { registerCandidate } from "../_lib/api";

export function useRegister() {
  return useMutation({
    mutationFn: registerCandidate,
  });
}
