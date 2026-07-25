/**
 * Application-layer error model (§3.2). Use cases return Result<T, AppError>;
 * Server Actions map to public DTO without leaking internals.
 */
export type AppErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'RETRY_EXHAUSTED'
  | 'FOUNDATION_NOT_READY'
  | 'FOUNDATION_LOCKED'
  | 'OUTLINE_DOWNSTREAM_LOCKED'
  | 'CHANGE_SET_INVALID'
  | 'CAS_FAILED';

export interface AppError {
  readonly code: AppErrorCode;
  readonly publicMessageCode: string;
  readonly httpStatus: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function appError(
  code: AppErrorCode,
  publicMessageCode: string,
  httpStatus: number,
  details?: Readonly<Record<string, unknown>>,
): AppError {
  return details === undefined
    ? { code, publicMessageCode, httpStatus }
    : { code, publicMessageCode, httpStatus, details };
}

export function notFound(publicMessageCode = 'msg.error.not_found'): AppError {
  return appError('NOT_FOUND', publicMessageCode, 404);
}
