import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  CandidateErrorCode,
  ErrorResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from "shared";
import type { ZodError } from "zod";

import {
  EmailAlreadyRegisteredError,
  PhoneAlreadyRegisteredError,
  RegistrationClosedError,
} from "../core/errors/candidate-errors";
import { httpError } from "../lib/http-error";
import { CandidateRepository } from "../repositories/candidates.repository";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { CandidateService } from "../services/candidates.service";

export const candidatesRouter = new OpenAPIHono<{
  Bindings: CloudflareBindings;
}>();

function buildService(env: CloudflareBindings): CandidateService {
  return new CandidateService(
    new CandidateRepository(env.DB),
    new SelectionProcessRepository(env.DB),
  );
}

/** Diferencia E3 (email inválido) de E4 (telefone inválido) a partir do primeiro issue do Zod. */
function mapRegisterValidationError(error: ZodError) {
  const issue = error.issues[0];
  const path = issue?.path[0];

  if (path === "email") {
    return {
      code: CandidateErrorCode.INVALID_EMAIL as string,
      message: issue.message,
      field: "email",
    };
  }
  if (path === "phone") {
    return {
      code: CandidateErrorCode.INVALID_PHONE as string,
      message: issue.message,
      field: "phone",
    };
  }
  return {
    code: "VALIDATION_ERROR",
    message: issue?.message ?? "Dados inválidos",
    field: typeof path === "string" ? path : undefined,
  };
}

const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["Candidates"],
  summary: "Inscreve um candidato no processo seletivo",
  description:
    "Valida os dados do candidato e do questionário e grava a inscrição no banco (candidato + questionário no mesmo batch). Passo único: não há confirmação por email.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RegisterRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Inscrição criada",
      content: { "application/json": { schema: RegisterResponseSchema } },
    },
    400: {
      description:
        "Email inválido (E3), telefone inválido (E4) ou origem 'outros' sem descrição (E6)",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Prazo de inscrição encerrado",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "Email ou telefone já cadastrado (E1/E2/E5)",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    500: {
      description: "Erro inesperado",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

candidatesRouter.openapi(
  registerRoute,
  async (c) => {
    const body = c.req.valid("json");
    const service = buildService(c.env);
    const result = await service.register(body);

    if (result.isLeft()) {
      const error = result.value;
      if (error instanceof EmailAlreadyRegisteredError) {
        throw httpError(409, error.code, error.message, error.field);
      }
      if (error instanceof PhoneAlreadyRegisteredError) {
        throw httpError(409, error.code, error.message, error.field);
      }
      if (error instanceof RegistrationClosedError) {
        throw httpError(403, error.code, error.message);
      }
      throw httpError(500, "INTERNAL_ERROR", "Erro inesperado");
    }

    return c.json({ data: result.value }, 201);
  },
  (result, c) => {
    if (!result.success) {
      return c.json({ error: mapRegisterValidationError(result.error) }, 400);
    }
  },
);
