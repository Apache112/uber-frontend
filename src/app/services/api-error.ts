import { HttpErrorResponse } from '@angular/common/http';

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }

  const body: unknown = error.error;
  const validationErrors = readValidationErrors(body);
  if (validationErrors.length) {
    return validationErrors.join(' ');
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

function readValidationErrors(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }

  const errors: string[] = [];
  if ('errors' in body && typeof body.errors === 'object' && body.errors !== null) {
    for (const value of Object.values(body.errors)) {
      errors.push(...asStringArray(value));
    }
  }

  if ('detail' in body) {
    errors.push(...asDetailMessages(body.detail));
  }

  return errors;
}

function asStringArray(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

function asDetailMessages(detail: unknown): string[] {
  if (typeof detail === 'string') {
    return detail.trim() ? [detail] : [];
  }

  if (!Array.isArray(detail)) {
    return [];
  }

  return detail.flatMap((item: unknown) => {
    if (typeof item === 'string') {
      return item.trim() ? [item] : [];
    }
    if (typeof item !== 'object' || item === null || !('msg' in item) || typeof item.msg !== 'string') {
      return [];
    }

    const location =
      'loc' in item && Array.isArray(item.loc)
        ? item.loc.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
        : [];
    const field = location.filter((part) => part !== 'body').join('.');
    return [field ? `${field}: ${item.msg}` : item.msg];
  });
}
