import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

const apiUrl = environment.apiUrl.replace(/\/$/, '');
const localApiUrl = environment.localApiUrl.replace(/\/$/, '');

export const apiFallbackInterceptor: HttpInterceptorFn = (req, next) => {
  const isApiRequest = req.url === apiUrl || req.url.startsWith(`${apiUrl}/`) || req.url.startsWith(`${apiUrl}?`);

  if (!isApiRequest || !localApiUrl || localApiUrl === apiUrl) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 0) {
        return throwError(() => error);
      }

      return next(req.clone({ url: req.url.replace(apiUrl, localApiUrl) }));
    }),
  );
};
