/**
 * Faz chamadas concorrentes a uma operação assíncrona compartilharem a mesma
 * promise. O backend rotaciona o refresh token a cada uso e trata reuso como
 * roubo, revogando a família inteira — sem isso, requisições paralelas que
 * recebem 401 derrubariam a própria sessão.
 */
export function createSingleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return function run(): Promise<T> {
    if (inFlight) return inFlight;

    const started: Promise<T> = operation().finally(() => {
      // Só limpa se este ainda for o voo corrente.
      if (inFlight === started) inFlight = null;
    });

    inFlight = started;
    return started;
  };
}
