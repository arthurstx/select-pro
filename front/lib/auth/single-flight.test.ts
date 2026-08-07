import assert from "node:assert/strict";
import test from "node:test";

import { createSingleFlight } from "./single-flight.ts";

/** Promise que só resolve quando alguém chamar `settle`. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("N chamadas concorrentes disparam UMA execução e compartilham o resultado", async () => {
  let calls = 0;
  const gate = deferred<string>();

  const refresh = createSingleFlight(() => {
    calls += 1;
    return gate.promise;
  });

  // O cenário da seção 8.3: três requisições paralelas recebem 401 ao mesmo
  // tempo e pedem renovação antes de qualquer uma terminar.
  const waiting = [refresh(), refresh(), refresh()];
  assert.equal(calls, 1, "o refresh precisa ser único enquanto está em curso");

  gate.resolve("token-novo");
  const results = await Promise.all(waiting);

  assert.deepEqual(results, ["token-novo", "token-novo", "token-novo"]);
  assert.equal(calls, 1);
});

test("uma chamada depois do voo terminar inicia um voo novo", async () => {
  let calls = 0;
  const refresh = createSingleFlight(async () => {
    calls += 1;
    return calls;
  });

  assert.equal(await refresh(), 1);
  assert.equal(await refresh(), 2, "terminado o voo, o próximo pedido renova de novo");
  assert.equal(calls, 2);
});

test("a rejeição é compartilhada por todos os que esperavam, e não trava os próximos", async () => {
  let calls = 0;
  const gate = deferred<string>();

  const refresh = createSingleFlight(() => {
    calls += 1;
    return calls === 1 ? gate.promise : Promise.resolve("ok");
  });

  const waiting = [refresh(), refresh()];
  gate.reject(new Error("refresh falhou"));

  const outcomes = await Promise.allSettled(waiting);
  assert.deepEqual(
    outcomes.map((o) => o.status),
    ["rejected", "rejected"],
    "se o refresh falha, todas as requisições que esperavam falham juntas",
  );
  assert.equal(calls, 1);

  assert.equal(await refresh(), "ok", "um voo que falhou não pode travar os seguintes");
  assert.equal(calls, 2);
});

test("chamadas em sequência dentro do mesmo voo continuam compartilhando", async () => {
  let calls = 0;
  const gate = deferred<string>();
  const refresh = createSingleFlight(() => {
    calls += 1;
    return gate.promise;
  });

  const first = refresh();
  await Promise.resolve(); // deixa microtasks rodarem — o voo segue pendente
  const second = refresh();

  assert.equal(calls, 1);
  assert.equal(first, second, "o mesmo objeto Promise é devolvido, não uma cópia");

  gate.resolve("token");
  await Promise.all([first, second]);
});
