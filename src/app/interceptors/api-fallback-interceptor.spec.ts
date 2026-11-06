import type { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';

import { apiFallbackInterceptor } from './api-fallback-interceptor';

describe('apiFallbackInterceptor', () => {
  let http: HttpClient;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiFallbackInterceptor])), provideHttpClientTesting()],
    });

    http = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('retries API requests against localhost after a network error', () => {
    let response: { ok: boolean } | undefined;

    http.get<{ ok: boolean }>(`${environment.apiUrl}/health`).subscribe((value) => {
      response = value;
    });

    httpTestingController
      .expectOne(`${environment.apiUrl}/health`)
      .flush(null, { status: 0, statusText: 'Network Error' });
    httpTestingController.expectOne(`${environment.localApiUrl}/health`).flush({ ok: true });

    expect(response).toEqual({ ok: true });
  });

  it('does not retry when the API returns an HTTP error', () => {
    let error: HttpErrorResponse | undefined;

    http.get(`${environment.apiUrl}/health`).subscribe({
      error: (requestError: HttpErrorResponse) => {
        error = requestError;
      },
    });

    httpTestingController
      .expectOne(`${environment.apiUrl}/health`)
      .flush({}, { status: 503, statusText: 'Service Unavailable' });

    expect(error?.status).toBe(503);
    httpTestingController.expectNone(`${environment.localApiUrl}/health`);
  });
});
