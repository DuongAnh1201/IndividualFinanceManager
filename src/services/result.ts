/** Use-case outcome: validation failures are values, not exceptions. */
export interface FieldError {
  code: string;
  field: string;
  message: string;
}

export type Result<T, E = FieldError> = { ok: true; value: T } | { ok: false; errors: E[] };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E>(errors: E[]): Result<never, E> => ({ ok: false, errors });
export const notFound = (what: string): Result<never, FieldError> =>
  fail([{ code: "not-found", field: "id", message: `${what} not found.` }]);
