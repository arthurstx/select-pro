import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateHostDeficit,
  classifyPresencialGroup,
  deriveEvaluatorTargetForGroupSize,
  deriveRoomCapacity,
  derivePresencialGroupCount,
  recommendRoomsForGroups,
} from "./room.schema.ts";

// Fronteiras exatas das faixas (D5, CONTEXT.md) — 50/51 e 80/81 são os
// pontos onde um off-by-one quebraria silenciosamente.

test("até 50 pessoas: 1 host, 2 grupos", () => {
  assert.deepEqual(deriveRoomCapacity(1), { hostCount: 1, maxGroups: 2 });
  assert.deepEqual(deriveRoomCapacity(40), { hostCount: 1, maxGroups: 2 });
  assert.deepEqual(deriveRoomCapacity(50), { hostCount: 1, maxGroups: 2 });
});

test("51 a 80 pessoas: 2 hosts, 3 grupos", () => {
  assert.deepEqual(deriveRoomCapacity(51), { hostCount: 2, maxGroups: 3 });
  assert.deepEqual(deriveRoomCapacity(65), { hostCount: 2, maxGroups: 3 });
  assert.deepEqual(deriveRoomCapacity(80), { hostCount: 2, maxGroups: 3 });
});

test("mais de 80 pessoas: 2 hosts, 4 grupos", () => {
  assert.deepEqual(deriveRoomCapacity(81), { hostCount: 2, maxGroups: 4 });
  assert.deepEqual(deriveRoomCapacity(120), { hostCount: 2, maxGroups: 4 });
});

test("mesma capacidade sempre produz o mesmo resultado (SC-002)", () => {
  assert.deepEqual(deriveRoomCapacity(60), deriveRoomCapacity(60));
});

// FEAT-0020 — derivePresencialGroupCount: sempre 3-5 candidatos por grupo.

test("derivePresencialGroupCount — 0 candidatos: 0 grupos", () => {
  assert.equal(derivePresencialGroupCount(0), 0);
});

test("derivePresencialGroupCount — até 5 candidatos: 1 grupo único, mesmo abaixo de 3", () => {
  assert.equal(derivePresencialGroupCount(1), 1);
  assert.equal(derivePresencialGroupCount(3), 1);
  assert.equal(derivePresencialGroupCount(5), 1);
});

test("derivePresencialGroupCount — 6 candidatos: 2 grupos de 3, não 1 grupo de 6", () => {
  assert.equal(derivePresencialGroupCount(6), 2);
});

test("derivePresencialGroupCount — 13 candidatos: 3 grupos (média ~4.3, dentro de 3-5)", () => {
  const groups = derivePresencialGroupCount(13);
  assert.equal(groups, 3);
  assert.ok(13 / groups >= 3 && 13 / groups <= 5);
});

test("derivePresencialGroupCount — 25 candidatos: 5 grupos de 5", () => {
  assert.equal(derivePresencialGroupCount(25), 5);
});

test("derivePresencialGroupCount — respeita o teto de maxGroups (capacidade física da sala)", () => {
  // 10 candidatos, sala que só comporta 2 grupos (D5, ≤50 lugares) — cabe exato: 5 e 5.
  assert.equal(derivePresencialGroupCount(10, 2), 2);
});

// FEAT-0020 — deriveEvaluatorTargetForGroupSize: 1 pra grupo de 3, 2 pra grupo de 4-5.

test("deriveEvaluatorTargetForGroupSize — 3 candidatos: 1 avaliador", () => {
  assert.equal(deriveEvaluatorTargetForGroupSize(3), 1);
});

test("deriveEvaluatorTargetForGroupSize — 4 e 5 candidatos: 2 avaliadores", () => {
  assert.equal(deriveEvaluatorTargetForGroupSize(4), 2);
  assert.equal(deriveEvaluatorTargetForGroupSize(5), 2);
});

// FEAT-0020 — recommendRoomsForGroups: maior faixa primeiro (D5).

test("recommendRoomsForGroups — 0 grupos: recomendação vazia", () => {
  assert.deepEqual(recommendRoomsForGroups(0), []);
});

test("recommendRoomsForGroups — 4 grupos: 1 sala grande (4 grupos/2 hosts)", () => {
  assert.deepEqual(recommendRoomsForGroups(4), [{ maxGroups: 4, hostCount: 2, roomsNeeded: 1 }]);
});

test("recommendRoomsForGroups — 8 grupos: 2 salas grandes", () => {
  assert.deepEqual(recommendRoomsForGroups(8), [{ maxGroups: 4, hostCount: 2, roomsNeeded: 2 }]);
});

test("recommendRoomsForGroups — 5 grupos: 1 sala grande (4) + 1 sala pequena (2, sobra 1 cabe nela)", () => {
  assert.deepEqual(recommendRoomsForGroups(5), [
    { maxGroups: 4, hostCount: 2, roomsNeeded: 1 },
    { maxGroups: 2, hostCount: 1, roomsNeeded: 1 },
  ]);
});

test("recommendRoomsForGroups — 1 grupo: 1 sala pequena (a menor que já comporta 1)", () => {
  assert.deepEqual(recommendRoomsForGroups(1), [{ maxGroups: 2, hostCount: 1, roomsNeeded: 1 }]);
});

// FEAT-0022 — calculateHostDeficit: quantos hosts a estrutura de salas usada realmente exige.

test("calculateHostDeficit — sem salas usadas: nada é necessário", () => {
  assert.deepEqual(calculateHostDeficit([], 0), { required: 0, deficit: 0 });
});

test("calculateHostDeficit — 1 sala pequena (1 host) com host presente: sem déficit", () => {
  assert.deepEqual(calculateHostDeficit([50], 1), { required: 1, deficit: 0 });
});

test("calculateHostDeficit — 1 sala pequena, nenhum host presente: falta 1", () => {
  assert.deepEqual(calculateHostDeficit([50], 0), { required: 1, deficit: 1 });
});

test("calculateHostDeficit — 2 salas grandes (2 hosts cada) com só 1 host presente: falta 3", () => {
  assert.deepEqual(calculateHostDeficit([90, 90], 1), { required: 4, deficit: 3 });
});

test("calculateHostDeficit — hosts presentes sobrando: déficit fica em 0, nunca negativo", () => {
  assert.deepEqual(calculateHostDeficit([50], 5), { required: 1, deficit: 0 });
});

// FEAT-0022 — classifyPresencialGroup: ideal (4-5 + 2 avaliadores), aceitável (3 + 1), fora do ideal (resto).

test("classifyPresencialGroup — 4 ou 5 candidatos com 2 avaliadores: ideal", () => {
  assert.equal(classifyPresencialGroup(4, 2), "ideal");
  assert.equal(classifyPresencialGroup(5, 2), "ideal");
});

test("classifyPresencialGroup — 3 candidatos com 1 avaliador: aceitável", () => {
  assert.equal(classifyPresencialGroup(3, 1), "aceitavel");
});

test("classifyPresencialGroup — qualquer outra combinação: fora do ideal", () => {
  assert.equal(classifyPresencialGroup(4, 1), "fora_do_ideal"); // grupo de 4 sem o segundo avaliador
  assert.equal(classifyPresencialGroup(3, 2), "fora_do_ideal"); // grupo de 3 com avaliador a mais
  assert.equal(classifyPresencialGroup(6, 2), "fora_do_ideal"); // grupo maior que o permitido
  assert.equal(classifyPresencialGroup(2, 1), "fora_do_ideal"); // grupo menor que o mínimo
  assert.equal(classifyPresencialGroup(5, 0), "fora_do_ideal"); // sem avaliador nenhum
});
