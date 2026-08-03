import { useMutation } from "@tanstack/react-query";

import { confirmOtc } from "../_lib/api";

export function useConfirmOtc() {
  return useMutation({
    mutationFn: confirmOtc,
  });
}
