import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RideEstimateRequest {
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
}

export interface RideEstimate {
  distance_km: number;
  duration_min: number;
  estimated_fare: number;
  currency: string;
}

export interface RideRequestPayload extends RideEstimateRequest {
  origin_name: string;
  destination_name: string;
}

export interface RideRequest {
  id: number;
  origin_name: string;
  destination_name: string;
  estimated_distance_km: number;
  estimated_fare: number;
  status?: string;
  client?: { name: string; phone?: string };
}

export interface DriverTrip {
  id: number;
  status: string;
  estimated_fare?: number;
  final_fare?: number;
  origin_name?: string;
  destination_name?: string;
}

export interface ClientActiveResponse {
  has_active: boolean;
  type?: 'request' | 'trip';
  data?: {
    id: number;
    status?: string;
    estimated_fare?: number;
    origin_name?: string;
    destination_name?: string;
    driver?: {
      user?: { name: string; phone?: string };
      latest_location?: Coordinates;
    };
    vehicle?: {
      plate: string;
      brand?: string;
      model?: string;
      color?: string;
    };
  };
}

export interface ClientTrip {
  id: number;
  status: string;
  final_fare?: number;
  completed_at?: string;
  driver?: { user?: { name: string } };
  vehicle?: { plate: string };
  rating?: { score: number };
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  estimateFare(coords: RideEstimateRequest): Observable<{ estimate: RideEstimate }> {
    return this.http.post<{ estimate: RideEstimate }>(`${this.apiUrl}/client/estimate-fare`, coords);
  }

  createRideRequest(rideData: RideRequestPayload): Observable<{ ride_request: RideRequest }> {
    return this.http.post<{ ride_request: RideRequest }>(`${this.apiUrl}/client/ride-requests`, rideData);
  }

  getClientActive(): Observable<ClientActiveResponse> {
    return this.http.get<ClientActiveResponse>(`${this.apiUrl}/client/active`);
  }

  cancelClientRide(id: number, reason: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/client/cancel/${id}`, { reason });
  }

  getClientTrips(): Observable<{ trips: { data: ClientTrip[] } }> {
    return this.http.get<{ trips: { data: ClientTrip[] } }>(`${this.apiUrl}/client/trips`);
  }

  rateClientTrip(
    id: number,
    rating: { score: number; comment: string; has_incident: boolean },
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/client/trips/${id}/rating`, rating);
  }

  toggleAvailability(status: 'available' | 'unavailable'): Observable<{
    availability_status: 'available' | 'unavailable';
  }> {
    return this.http.put<{ availability_status: 'available' | 'unavailable' }>(`${this.apiUrl}/driver/availability`, {
      status,
    });
  }

  getAvailableRequests(): Observable<{ requests: RideRequest[] }> {
    return this.http.get<{ requests: RideRequest[] }>(`${this.apiUrl}/driver/ride-requests`);
  }

  acceptRideRequest(id: number): Observable<{ trip: DriverTrip }> {
    return this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/ride-requests/${id}/accept`, {});
  }

  markDriverArrived(id: number): Observable<{ trip: DriverTrip }> {
    return this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/trips/${id}/arrive`, {});
  }

  startDriverTrip(id: number): Observable<{ trip: DriverTrip }> {
    return this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/trips/${id}/start`, {});
  }

  completeDriverTrip(
    id: number,
    actualDistanceKm: number,
    actualDurationMin: number,
  ): Observable<{ trip: DriverTrip }> {
    return this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/trips/${id}/complete`, {
      actual_distance_km: actualDistanceKm,
      actual_duration_min: actualDurationMin,
    });
  }

  updateDriverLocation(
    location: Coordinates & { heading?: number; speed?: number; trip_id?: number },
  ): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/driver/location`, location);
  }
}
