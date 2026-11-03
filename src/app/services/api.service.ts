import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // Módulo Cliente
  estimateFare(coords: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/client/estimate-fare`, coords);
  }

  createRideRequest(rideData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/client/ride-requests`, rideData);
  }

  // Módulo Conductor
  toggleAvailability(status: 'available' | 'unavailable'): Observable<any> {
    return this.http.put(`${this.apiUrl}/driver/availability`, { status });
  }

  getAvailableRequests(): Observable<any> {
    return this.http.get(`${this.apiUrl}/driver/ride-requests`);
  }
}
