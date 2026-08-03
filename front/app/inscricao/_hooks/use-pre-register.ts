import { useMutation } from "@tanstack/react-query";

import { preRegisterCandidate } from "../_lib/api";

export function usePreRegister() {
  return useMutation({
    mutationFn: preRegisterCandidate,
  });
}
