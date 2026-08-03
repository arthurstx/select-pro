import { ErrorResponseSchema } from "shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** Converte uma Response não-2xx no envelope `{ error }` (FEAT-0001) em ApiError. */
export async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const parsed = ErrorResponseSchema.safeParse(body);

  if (!parsed.success) {
    return new ApiError(response.status, "UNKNOWN_ERROR", "Algo deu errado. Tente novamente.");
  }

  return new ApiError(
    response.status,
    parsed.data.error.code,
    parsed.data.error.message,
    parsed.data.error.field,
  );
}
