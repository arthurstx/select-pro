import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface AuthSubmitButtonProps {
  pending: boolean;
  pendingLabel: string;
  children: React.ReactNode;
}

/**
 * Estado "enviando" das telas de auth (seção 5): botão desabilitado + indicador.
 * O `aria-live` faz o leitor de tela anunciar a troca de rótulo.
 */
export function AuthSubmitButton({ pending, pendingLabel, children }: AuthSubmitButtonProps) {
  return (
    <Button type="submit" size="lg" className="h-11 w-full" disabled={pending} aria-busy={pending}>
      {pending && <Spinner aria-hidden />}
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </Button>
  );
}
