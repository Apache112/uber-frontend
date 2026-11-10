import { HttpErrorResponse } from '@angular/common/http';

import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('prefers field validation errors over a generic server message', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: {
        message: 'The given data was invalid.',
        errors: {
          email: ['The email has already been taken.'],
          license_number: ['The license number is required.'],
        },
      },
    });

    expect(apiErrorMessage(error, 'Fallback')).toBe(
      'The email has already been taken. The license number is required.',
    );
  });

  it('provides a clear message when the server does not include validation details', () => {
    const error = new HttpErrorResponse({ status: 422 });

    expect(apiErrorMessage(error, 'Fallback')).toContain('El servidor rechazó');
  });

  it('shows field details from a FastAPI-style validation response', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: {
        detail: [
          {
            loc: ['body', 'license_number'],
            msg: 'Field required',
            type: 'missing',
          },
        ],
      },
    });

    expect(apiErrorMessage(error, 'Fallback')).toBe('license_number: Field required');
  });
});
