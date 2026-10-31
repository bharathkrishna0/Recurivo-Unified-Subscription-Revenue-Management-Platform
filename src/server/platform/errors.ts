export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Domain error with a stable machine code and a human-readable message. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const forbidden = (message = "You do not have permission to do that.") => new AppError("FORBIDDEN", message);
/** Not-found is also used for records outside the caller's scope so IDs are not confirmed. */
export const notFound = (message = "Record not found.") => new AppError("NOT_FOUND", message);
export const invalid = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError("VALIDATION_FAILED", message, fieldErrors);
