import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface WizardNavProps {
  /** Omitido na etapa 1 — não há etapa anterior. */
  onBack?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function WizardNav({ onBack, submitLabel = "Avançar", isSubmitting = false }: WizardNavProps) {
  return (
    <div className="mt-8 flex gap-3">
      {onBack && (
        <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
      )}
      <Button type="submit" size="lg" className="flex-1" disabled={isSubmitting}>
        {isSubmitting && <Spinner data-icon="inline-start" />}
        {submitLabel}
      </Button>
    </div>
  );
}
