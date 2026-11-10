import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { apiFallbackInterceptor } from '../interceptors/api-fallback-interceptor';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiFallbackInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('registers a local account when the API is unreachable', async () => {
    const registration = firstValueFrom(
      service.register({
        name: 'Cliente local',
        email: 'cliente@example.com',
        password: 'clave123',
        role: 'client',
      }),
    );

    httpTestingController
      .expectOne(`${environment.apiUrl}/auth/register`)
      .flush(null, { status: 0, statusText: 'Network Error' });

    const response = await registration;
    expect(response.user.role).toBe('client');
    expect(response.access_token).toBe('offline-1');
    expect(localStorage.getItem('offline_mode')).toBe('true');
  });

  it('opens a local passenger session when the server is down and the account was never cached', async () => {
    const login = firstValueFrom(service.login({ login: 'pasajero@example.com', password: 'clave123' }));

    httpTestingController
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush(null, { status: 0, statusText: 'Network Error' });

    const response = await login;
    expect(response.user.role).toBe('client');
    expect(response.access_token).toBe('offline-1');
    expect(response.message).toContain('no pudo verificarse');
    expect(localStorage.getItem('offline_mode')).toBe('true');
  });
});
