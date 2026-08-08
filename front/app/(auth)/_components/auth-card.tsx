import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

/** Cartão branco onde vive o conteúdo de cada tela de auth. */
export function AuthCard({ title, description, className, children }: AuthCardProps) {
  return (
    <section
      className={cn(
        "border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8",
        className,
      )}
    >
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{description}</p>
        )}
      </header>

      {children}
    </section>
  );
}
