import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { catchError, defer, from, of, throwError, tap } from 'rxjs';

import { environment } from '../../environments/environment';

import { OfflineDataService } from './offline-data.service';

export interface AuthResponse {
  success: boolean;
  access_token: string;
  user: { role: string };
  message?: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: 'client' | 'driver';
  phone?: string;
  license_number?: string;
  plate?: string;
  brand?: string;
  model?: string;
  year?: number;
  capacity?: number;
  color?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private offline = inject(OfflineDataService);
  private apiUrl = environment.apiUrl;

  login(credentials: { login: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap((response) => {
        this.offline.setOfflineMode(false);
        void this.cacheCredentials(credentials.login, credentials.password, response.user.role);
      }),
      catchError((error: unknown) =>
        this.withOfflineFallback(error, () => this.offline.loginOrCreateLocalPassenger(credentials)),
      ),
      tap((response) => this.storeSession(response)),
    );
  }

  register(userData: RegisterPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, userData).pipe(
      tap((response) => {
        this.offline.setOfflineMode(false);
        void this.cacheCredentials(userData.email, userData.password, response.user.role, userData);
      }),
      catchError((error: unknown) => this.withOfflineFallback(error, () => this.offline.register(userData))),
      tap((response) => this.storeSession(response)),
    );
  }

  loginLocal(credentials: { login: string; password: string }): Observable<AuthResponse> {
    return defer(() => from(this.offline.login(credentials))).pipe(tap((response) => this.storeSession(response)));
  }

  registerLocal(userData: RegisterPayload): Observable<AuthResponse> {
    return defer(() => from(this.offline.register(userData))).pipe(tap((response) => this.storeSession(response)));
  }

  logout(): Observable<{ success: boolean; message?: string }> {
    if (this.offline.isLocalSession()) {
      this.offline.setOfflineMode(true);
      return defer(() => of(this.offline.logout()));
    }

    return this.http.post<{ success: boolean; message?: string }>(`${this.apiUrl}/auth/logout`, {}).pipe(
      tap(() => {
        this.offline.setOfflineMode(false);
        this.clearSession();
      }),
      catchError((error: unknown) =>
        this.withOfflineFallback(error, () => {
          const response = this.offline.logout();
          this.offline.setOfflineMode(true);
          return response;
        }),
      ),
    );
  }

  getRole(): string | null {
    return localStorage.getItem('user_role');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  }

  private storeSession(response: AuthResponse) {
    if (response.success) {
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('user_role', response.user.role);
    }
  }

  private clearSession(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('offline_user_id');
  }

  private async cacheCredentials(
    login: string,
    password: string,
    role: string,
    profile?: RegisterPayload,
  ): Promise<void> {
    try {
      await this.offline.cacheOnlineCredentials(login, password, role, profile);
    } catch (error) {
      console.error('No se pudieron guardar las credenciales para uso sin conexión.', error);
    }
  }

  private withOfflineFallback<T>(error: unknown, fallback: () => T | Promise<T>): Observable<T> {
    if (!(error instanceof HttpErrorResponse) || error.status !== 0) {
      return throwError(() => error);
    }

    this.offline.setOfflineMode(true);
    return defer(() => from(Promise.resolve(fallback())));
  }
}
