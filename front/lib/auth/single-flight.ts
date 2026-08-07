/**
 * Faz com que chamadas concorrentes a uma operação assíncrona compartilhem a
 * **mesma** promise, em vez de cada uma disparar sua própria execução.
 *
 * Existe por causa de um requisito duro do FEAT-0003-UI (seção 8.3): o backend
 * **rotaciona** o refresh token a cada uso e trata a reapresentação de um token
 * já usado como roubo, revogando a família inteira de sessões. Se três
 * requisições paralelas receberem `401 TOKEN_EXPIRED` e cada uma chamar
 * `/auth/refresh`, a primeira rotaciona e as outras duas chegam com um token já
 * revogado — o backend, corretamente, desloga o membro de tudo.
 *
 * Deliberadamente sem dependência nenhuma: é o pedaço da sessão que precisa ser
 * testável isoladamente (`single-flight.test.ts`).
 *
 * Semântica:
 * - enquanto houver um voo em curso, todo chamador recebe a promise dele;
 * - quando o voo termina (resolvido *ou* rejeitado), o próximo chamador inicia
 *   um voo novo — um refresh que falhou não pode travar os seguintes;
 * - a rejeição é compartilhada: todos os que esperavam falham juntos.
 */
export function createSingleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return function run(): Promise<T> {
    if (inFlight) return inFlight;

    const started: Promise<T> = operation().finally(() => {
      // Só limpa se este ainda for o voo corrente. A comparação evita que um
      // voo antigo, terminando tarde, apague o voo que já o substituiu.
      if (inFlight === started) inFlight = null;
    });

    inFlight = started;
    return started;
  };
}
