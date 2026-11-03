import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';

import { environment } from '../../environments/environment';

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
  // Reemplaza con la IP real de tu servidor Laravel configurado en el puerto 8000
  private apiUrl = environment.apiUrl;

  login(credentials: { login: string; password: string }): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials)
      .pipe(tap((response) => this.storeSession(response)));
  }

  register(userData: RegisterPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/register`, userData)
      .pipe(tap((response) => this.storeSession(response)));
  }

  logout(): Observable<{ success: boolean; message?: string }> {
    return this.http.post<{ success: boolean; message?: string }>(`${this.apiUrl}/auth/logout`, {}).pipe(
      tap(() => {
        localStorage.clear();
      }),
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
}
