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

// FEAT-0023 — host e grupos vêm da classificação da sala, não da lotação.

test("sala comum: 1 host, 2 grupos", () => {
  assert.deepEqual(deriveRoomCapacity("comum"), { hostCount: 1, maxGroups: 2 });
});

test("anfiteatro: 2 hosts, 4 grupos", () => {
  assert.deepEqual(deriveRoomCapacity("anfiteatro"), { hostCount: 2, maxGroups: 4 });
});

test("mesma classificação sempre produz o mesmo resultado (SC-002)", () => {
  assert.deepEqual(deriveRoomCapacity("comum"), deriveRoomCapacity("comum"));
});

// FEAT-0020, ajustado na FEAT-0022 — derivePresencialGroupCount: 5-7 candidatos por grupo, 5 o ideal.

test("derivePresencialGroupCount — 0 candidatos: 0 grupos", () => {
  assert.equal(derivePresencialGroupCount(0), 0);
});

test("derivePresencialGroupCount — até 7 candidatos: 1 grupo único, mesmo abaixo de 5", () => {
  assert.equal(derivePresencialGroupCount(1), 1);
  assert.equal(derivePresencialGroupCount(5), 1);
  assert.equal(derivePresencialGroupCount(7), 1);
});

test("derivePresencialGroupCount — 8 ou 9 candidatos: gap do intervalo 5-7 — 2 grupos abaixo do ideal, nunca 1 grupo acima do teto", () => {
  assert.equal(derivePresencialGroupCount(8), 2);
  assert.equal(derivePresencialGroupCount(9), 2);
});

test("derivePresencialGroupCount — 10 candidatos: 2 grupos de 5 (ideal)", () => {
  assert.equal(derivePresencialGroupCount(10), 2);
});

test("derivePresencialGroupCount — 14 candidatos: 2 grupos de 7 (no teto)", () => {
  assert.equal(derivePresencialGroupCount(14), 2);
});

test("derivePresencialGroupCount — 15 candidatos: 3 grupos (média 5, dentro de 5-7)", () => {
  const groups = derivePresencialGroupCount(15);
  assert.equal(groups, 3);
  assert.ok(15 / groups >= 5 && 15 / groups <= 7);
});

test("derivePresencialGroupCount — 35 candidatos: 5 grupos de 7 (no teto)", () => {
  assert.equal(derivePresencialGroupCount(35), 5);
});

test("derivePresencialGroupCount — respeita o teto de maxGroups (capacidade física da sala)", () => {
  // 15 candidatos exigiriam 3 grupos pra ficar no ideal (5 cada), mas a sala comum só comporta
  // 2 grupos (FEAT-0023) — o teto de sala vence. Na prática o service já limita `count` antes de chamar
  // esta função pra isso nunca ultrapassar o máximo de 7 por grupo de verdade.
  assert.equal(derivePresencialGroupCount(15, 2), 2);
});

// FEAT-0020, ajustado na FEAT-0022 — deriveEvaluatorTargetForGroupSize: 1 pra grupo de 5 (ideal), 2 pra grupo de 6-7.

test("deriveEvaluatorTargetForGroupSize — 5 candidatos (ideal): 1 avaliador", () => {
  assert.equal(deriveEvaluatorTargetForGroupSize(5), 1);
});

test("deriveEvaluatorTargetForGroupSize — 6 e 7 candidatos: 2 avaliadores", () => {
  assert.equal(deriveEvaluatorTargetForGroupSize(6), 2);
  assert.equal(deriveEvaluatorTargetForGroupSize(7), 2);
});

// FEAT-0020, ajustado na FEAT-0023 — recommendRoomsForGroups: anfiteatro primeiro.

test("recommendRoomsForGroups — 0 grupos: recomendação vazia", () => {
  assert.deepEqual(recommendRoomsForGroups(0), []);
});

test("recommendRoomsForGroups — 4 grupos: 1 anfiteatro (4 grupos/2 hosts)", () => {
  assert.deepEqual(recommendRoomsForGroups(4), [{ type: "anfiteatro", maxGroups: 4, hostCount: 2, roomsNeeded: 1 }]);
});

test("recommendRoomsForGroups — 8 grupos: 2 anfiteatros", () => {
  assert.deepEqual(recommendRoomsForGroups(8), [{ type: "anfiteatro", maxGroups: 4, hostCount: 2, roomsNeeded: 2 }]);
});

test("recommendRoomsForGroups — 5 grupos: 1 anfiteatro (4) + 1 sala comum (2, sobra 1 cabe nela)", () => {
  assert.deepEqual(recommendRoomsForGroups(5), [
    { type: "anfiteatro", maxGroups: 4, hostCount: 2, roomsNeeded: 1 },
    { type: "comum", maxGroups: 2, hostCount: 1, roomsNeeded: 1 },
  ]);
});

test("recommendRoomsForGroups — 1 grupo: 1 sala comum (a menor que já comporta 1)", () => {
  assert.deepEqual(recommendRoomsForGroups(1), [{ type: "comum", maxGroups: 2, hostCount: 1, roomsNeeded: 1 }]);
});

// FEAT-0022 — calculateHostDeficit: quantos hosts a estrutura de salas usada realmente exige.

test("calculateHostDeficit — sem salas usadas: nada é necessário", () => {
  assert.deepEqual(calculateHostDeficit([], 0), { required: 0, deficit: 0 });
});

test("calculateHostDeficit — 1 sala comum (1 host) com host presente: sem déficit", () => {
  assert.deepEqual(calculateHostDeficit(["comum"], 1), { required: 1, deficit: 0 });
});

test("calculateHostDeficit — 1 sala comum, nenhum host presente: falta 1", () => {
  assert.deepEqual(calculateHostDeficit(["comum"], 0), { required: 1, deficit: 1 });
});

test("calculateHostDeficit — 2 anfiteatros (2 hosts cada) com só 1 host presente: falta 3", () => {
  assert.deepEqual(calculateHostDeficit(["anfiteatro", "anfiteatro"], 1), { required: 4, deficit: 3 });
});

test("calculateHostDeficit — hosts presentes sobrando: déficit fica em 0, nunca negativo", () => {
  assert.deepEqual(calculateHostDeficit(["comum"], 5), { required: 1, deficit: 0 });
});

// FEAT-0022, ajustado — classifyPresencialGroup: ideal (5 + 1 avaliador), aceitável (6-7 + 2), fora do ideal (resto).

test("classifyPresencialGroup — 5 candidatos (ideal) com 1 avaliador: ideal", () => {
  assert.equal(classifyPresencialGroup(5, 1), "ideal");
});

test("classifyPresencialGroup — 6 ou 7 candidatos com 2 avaliadores: aceitável", () => {
  assert.equal(classifyPresencialGroup(6, 2), "aceitavel");
  assert.equal(classifyPresencialGroup(7, 2), "aceitavel");
});

test("classifyPresencialGroup — qualquer outra combinação: fora do ideal", () => {
  assert.equal(classifyPresencialGroup(5, 2), "fora_do_ideal"); // ideal (5) com avaliador a mais
  assert.equal(classifyPresencialGroup(6, 1), "fora_do_ideal"); // 6 candidatos sem o segundo avaliador
  assert.equal(classifyPresencialGroup(8, 2), "fora_do_ideal"); // grupo maior que o permitido
  assert.equal(classifyPresencialGroup(4, 1), "fora_do_ideal"); // grupo menor que o mínimo
  assert.equal(classifyPresencialGroup(5, 0), "fora_do_ideal"); // sem avaliador nenhum
});
