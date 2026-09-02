import type { MemberStatus } from "shared";

import { cn } from "@/lib/utils";

/**
 * FEAT-0021 (US4) — nome de avaliador/host trainee em vermelho, em toda listagem relevante
 * (grupos organizados e prévia da simulação). Componente pequeno pra não duplicar a condição
 * em cada lugar que lista avaliadores.
 */
export function MemberName({ name, memberStatus }: { name: string; memberStatus: MemberStatus }) {
  return <span className={cn("truncate", memberStatus === "trainee" && "text-red-600 dark:text-red-400")}>{name}</span>;
}
