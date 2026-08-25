import assert from "node:assert/strict";
import test from "node:test";

import { deriveRoomCapacity } from "./room.schema.ts";

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
