import type { EvaluationVerdict } from "shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const VERDICT_LABEL: Record<EvaluationVerdict, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

const VERDICT_CLASSNAME: Record<EvaluationVerdict, string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  aprovado: "bg-success/10 text-success border-success/20",
  reprovado: "bg-destructive/10 text-destructive border-destructive/20",
};

/** FR-006/FR-007 — pendente/aprovado/reprovado, calculado no backend (D2/D6), nunca editável aqui. */
export function VerdictBadge({ verdict }: { verdict: EvaluationVerdict }) {
  return (
    <Badge variant="outline" className={cn(VERDICT_CLASSNAME[verdict])}>
      {VERDICT_LABEL[verdict]}
    </Badge>
  );
}
