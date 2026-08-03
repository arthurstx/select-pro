import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface WizardNavProps {
  /** Omitido na etapa 1 — não há etapa anterior (FEAT-0001-UI v2.0, seção 4). */
  onBack?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

/**
 * Par de botões Voltar/Avançar compartilhado pelas etapas do wizard.
 * "Avançar" é sempre `type="submit"` — quem decide se avança é a validação
 * do formulário da etapa (`react-hook-form` + o schema Zod correspondente).
 */
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
