import assert from "node:assert/strict";
import test from "node:test";

import { formatPhone, formatPhoneAsYouType, isValidBrazilianPhone, toE164 } from "./phone.schema.ts";

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

// A validação por libphonenumber/max rejeita coisas que a regex anterior
// aceitava. Estes casos são a razão da biblioteca existir: todos têm forma
// de telefone e nenhum é um telefone.

test("rejeita números com forma válida mas que não existem no plano brasileiro", () => {
  assert.equal(toE164("11111111111"), null, "repetição óbvia, mas 11 dígitos");
  assert.equal(toE164("00000000000"), null);
  assert.equal(toE164("(00) 00000-0000"), null, "DDD 00 não existe");
  assert.equal(toE164("71888887777"), null, "celular brasileiro começa com 9 depois do DDD");
});

test("exige DDD — a libphonenumber sozinha aceitaria, interpretando o 98 como DDD", () => {
  assert.equal(toE164("988887777"), null, "9 dígitos, sem DDD");
  assert.equal(toE164("98888777"), null, "8 dígitos");
});

test("DDD 55 (Santa Maria/RS) não é confundido com o código do país", () => {
  // `5599999999` são 10 dígitos: DDD 55 + fixo. Se o `55` fosse tratado como
  // prefixo de país, sobrariam 8 dígitos e o número seria rejeitado.
  const e164 = toE164("5533334444");
  assert.equal(e164, "+555533334444");
  assert.equal(formatPhone(e164!), "(55) 3333-4444");
});

test("formatPhoneAsYouType mascara progressivamente enquanto digita", () => {
  assert.equal(formatPhoneAsYouType("7"), "7");
  assert.equal(formatPhoneAsYouType("71"), "(71)");
  assert.equal(formatPhoneAsYouType("719888"), "(71) 9888");
  assert.equal(formatPhoneAsYouType("71988887777"), "(71) 98888-7777");
});

test("formatPhoneAsYouType nao trava ao apagar", () => {
  // Reformatar a partir dos dígitos (e não do texto cru) faz o backspace
  // andar para trás sem a pontuação ser reinserida na frente do cursor.
  assert.equal(formatPhoneAsYouType("(71) 98888-777"), "(71) 98888-777");
  assert.equal(formatPhoneAsYouType("(71) 98888-"), "(71) 98888");
  assert.equal(formatPhoneAsYouType("(71)"), "(71)");
  assert.equal(formatPhoneAsYouType(""), "");
});

test("formatPhoneAsYouType ignora dígito além do 11º em vez de reescrever o campo", () => {
  assert.equal(formatPhoneAsYouType("719888877771234"), "(71) 98888-7777");
});

test("formatPhoneAsYouType aceita colagem de um E.164", () => {
  assert.equal(formatPhoneAsYouType("+5571988887777"), "+55 71 98888 7777");
});

test("isValidBrazilianPhone acompanha toE164", () => {
  assert.equal(isValidBrazilianPhone("(71) 98888-7777"), true);
  assert.equal(isValidBrazilianPhone("11111111111"), false);
});
