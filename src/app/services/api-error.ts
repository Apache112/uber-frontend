import { HttpErrorResponse } from '@angular/common/http';

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }

  const body: unknown = error.error;
  if (
    typeof body === 'object' &&
    body !== null &&
    'errors' in body &&
    typeof (body as { errors?: unknown }).errors === 'object'
  ) {
    const validationErrors = Object.values((body as { errors: Record<string, unknown> }).errors)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === 'string');

    if (validationErrors.length) {
      return validationErrors.join(' ');
    }
  }

  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (error.status === 422) {
    return 'El servidor rechazó algunos datos del formulario. Revisa los campos e inténtalo de nuevo.';
  }

  return fallback;
}
