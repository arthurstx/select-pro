import { Spinner } from "@/components/ui/spinner";

/** Fallback das telas que dependem da query string para renderizar. */
export function AuthCardSkeleton() {
  return (
    <div
      className="border-border bg-card flex min-h-80 items-center justify-center rounded-2xl border p-8 shadow-sm"
      aria-busy="true"
    >
      <Spinner className="text-primary size-6" />
    </div>
  );
}
