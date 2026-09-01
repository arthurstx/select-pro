import type { Gender } from "shared";

import { cn } from "@/lib/utils";

const GENDER_LABEL: Record<Gender, string> = {
  masculino: "M",
  feminino: "F",
  outro: "Outro",
};

/**
 * FEAT-0021 (US3) — badge discreto de sexo ao lado do nome do candidato, pra gestão revisar
 * D1 (nunca exatamente 1 mulher por grupo) visualmente. Cores translúcidas/baixo contraste de
 * propósito — o nome continua sendo o elemento principal, o badge só reforça.
 */
export function GenderBadge({ gender }: { gender: Gender }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        gender === "masculino" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        gender === "feminino" && "bg-red-500/10 text-red-600 dark:text-red-400",
        gender === "outro" && "bg-muted text-muted-foreground",
      )}
    >
      {GENDER_LABEL[gender]}
    </span>
  );
}
