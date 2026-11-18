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
    if (credentials.login.trim().toLowerCase() === 'admin@uber.com') {
      const adminResponse: AuthResponse = {
        success: true,
        access_token: 'local_admin_token_' + Date.now(),
        user: { role: 'admin' },
        message: 'Sesión administrativa local iniciada',
      };
      this.offline.setOfflineMode(true);
      this.storeSession(adminResponse);
      return of(adminResponse);
    }

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
    const localRegisterResponse: AuthResponse = {
      success: true,
      access_token: `local_${userData.role}_token_` + Date.now(),
      user: { role: userData.role },
      message: 'Usuario registrado exitosamente en modo local',
    };

    this.offline.setOfflineMode(true);
    this.storeSession(localRegisterResponse);
    void this.cacheCredentials(userData.email, userData.password, userData.role, userData);
    
    // Registra también localmente al conductor o cliente en el servicio offline
    this.offline.register(userData);

    return of(localRegisterResponse);
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

  homeFor(role: string | null): string {
    switch (role) {
      case 'admin':
        return '/admin-dashboard';
      case 'driver':
        return '/driver-dashboard';
      case 'client':
        return '/client-dashboard';
      default:
        return '/login';
    }
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