import assert from "node:assert/strict";
import test from "node:test";

import { formatPhone, toE164 } from "./phone.schema.ts";

// Os formatos abaixo não são hipotéticos: a PHONE_REGEX aceita todos eles,
// então todos podem estar gravados hoje (FEAT-0006, seção 8.2).

test("celular em qualquer máscara converge para o mesmo E.164", () => {
  const esperado = "+5571988887777";

  assert.equal(toE164("71988887777"), esperado);
  assert.equal(toE164("(71) 98888-7777"), esperado);
  assert.equal(toE164("(71)98888-7777"), esperado);
  assert.equal(toE164("71 98888 7777"), esperado);
  assert.equal(toE164("+55 71 98888-7777"), esperado);
  assert.equal(toE164("5571988887777"), esperado);
});

test("é idempotente — normalizar o que já está normalizado não muda nada", () => {
  const uma = toE164("(71) 98888-7777");
  assert.equal(uma, "+5571988887777");
  assert.equal(toE164(uma!), uma, "o backend revalida o que o front já normalizou");
});

test("fixo de 10 dígitos é aceito, não só celular", () => {
  // A PHONE_REGEX já aceitava `\\d{4,5}-?\\d{4}`; rejeitar agora abortaria a
  // migration por uma decisão nova, não por um dado ruim.
  assert.equal(toE164("7133334444"), "+557133334444");
  assert.equal(toE164("(71) 3333-4444"), "+557133334444");
});

test("devolve null no que não tem regra, em vez de inventar", () => {
  assert.equal(toE164("123"), null, "curto demais");
  assert.equal(toE164(""), null);
  assert.equal(toE164("abcdefghijk"), null, "sem dígito nenhum");
  assert.equal(toE164("988887777"), null, "9 dígitos: sem DDD, não dá para adivinhar");
  assert.equal(toE164("115571988887777"), null, "longo demais");
});

test("13 dígitos sem 55 na frente não é tratado como código de país", () => {
  // `1234567890123` tem o tamanho de um número com DDI, mas não começa em 55.
  assert.equal(toE164("1234567890123"), null);
});

test("formatPhone devolve o formato legível da tela", () => {
  assert.equal(formatPhone("+5571988887777"), "(71) 98888-7777");
  assert.equal(formatPhone("+557133334444"), "(71) 3333-4444", "fixo tem 4 dígitos no meio, não 5");
});

test("formatPhone não quebra com entrada fora do padrão", () => {
  // Uma tela nunca deve estourar por causa de um telefone inesperado.
  assert.equal(formatPhone("123"), "123");
  assert.equal(formatPhone(""), "");
  assert.equal(formatPhone("+1 555 0100"), "+1 555 0100", "não-brasileiro volta intacto");
});

test("toE164 e formatPhone fecham o ciclo", () => {
  const digitado = "(71) 98888-7777";
  const guardado = toE164(digitado)!;

  assert.equal(formatPhone(guardado), digitado, "o que o usuário digitou é o que ele vê de volta");
});
