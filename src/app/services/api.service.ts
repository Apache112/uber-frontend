import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = 'http://20.20.1.157';

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
