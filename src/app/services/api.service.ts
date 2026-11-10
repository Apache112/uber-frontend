import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { catchError, defer, of, throwError, tap } from 'rxjs';

import { environment } from '../../environments/environment';

import { OfflineDataService } from './offline-data.service';

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
  origin_latitude?: number;
  origin_longitude?: number;
  destination_latitude?: number;
  destination_longitude?: number;
  estimated_distance_km: number;
  estimated_duration_min?: number;
  estimated_fare: number;
  status?: string;
  client?: { name: string; phone?: string };
}

export interface DriverTrip {
  id: number;
  status: string;
  estimated_fare?: number;
  estimated_distance_km?: number;
  estimated_duration_min?: number;
  final_fare?: number;
  origin_name?: string;
  origin_latitude?: number;
  origin_longitude?: number;
  destination_name?: string;
  destination_latitude?: number;
  destination_longitude?: number;
}

export interface ClientActiveResponse {
  has_active: boolean;
  type?: 'request' | 'trip';
  data?: {
    id: number;
    status?: string;
    estimated_fare?: number;
    estimated_distance_km?: number;
    estimated_duration_min?: number;
    origin_name?: string;
    origin_latitude?: number;
    origin_longitude?: number;
    destination_name?: string;
    destination_latitude?: number;
    destination_longitude?: number;
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
  private offline = inject(OfflineDataService);
  private apiUrl = environment.apiUrl;

  estimateFare(coords: RideEstimateRequest): Observable<{ estimate: RideEstimate }> {
    return this.withOfflineFallback(
      this.http.post<{ estimate: RideEstimate }>(`${this.apiUrl}/client/estimate-fare`, coords),
      () => ({ estimate: this.offline.estimateFare(coords) }),
    );
  }

  createRideRequest(rideData: RideRequestPayload): Observable<{ ride_request: RideRequest }> {
    return this.withOfflineFallback(
      this.http.post<{ ride_request: RideRequest }>(`${this.apiUrl}/client/ride-requests`, rideData),
      () => this.offline.createRideRequest(rideData),
    );
  }

  getClientActive(): Observable<ClientActiveResponse> {
    return this.withOfflineFallback(this.http.get<ClientActiveResponse>(`${this.apiUrl}/client/active`), () =>
      this.offline.getClientActive(),
    );
  }

  cancelClientRide(id: number, reason: string): Observable<{ message: string }> {
    return this.withOfflineFallback(
      this.http.post<{ message: string }>(`${this.apiUrl}/client/cancel/${id}`, { reason }),
      () => this.offline.cancelClientRide(id, reason),
    );
  }

  getClientTrips(): Observable<{ trips: { data: ClientTrip[] } }> {
    return this.withOfflineFallback(
      this.http.get<{ trips: { data: ClientTrip[] } }>(`${this.apiUrl}/client/trips`),
      () => this.offline.getClientTrips(),
    );
  }

  rateClientTrip(
    id: number,
    rating: { score: number; comment: string; has_incident: boolean },
  ): Observable<{ message: string }> {
    return this.withOfflineFallback(
      this.http.post<{ message: string }>(`${this.apiUrl}/client/trips/${id}/rating`, rating),
      () => this.offline.rateClientTrip(id, rating),
    );
  }

  toggleAvailability(status: 'available' | 'unavailable'): Observable<{
    availability_status: 'available' | 'unavailable';
  }> {
    return this.withOfflineFallback(
      this.http.put<{ availability_status: 'available' | 'unavailable' }>(`${this.apiUrl}/driver/availability`, {
        status,
      }),
      () => this.offline.toggleAvailability(status),
    );
  }

  getAvailableRequests(): Observable<{ requests: RideRequest[] }> {
    return this.withOfflineFallback(
      this.http.get<{ requests: RideRequest[] }>(`${this.apiUrl}/driver/ride-requests`),
      () => this.offline.getAvailableRequests(),
    );
  }

  acceptRideRequest(id: number): Observable<{ trip: DriverTrip }> {
    return this.withOfflineFallback(
      this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/ride-requests/${id}/accept`, {}),
      () => this.offline.acceptRideRequest(id),
    );
  }

  markDriverArrived(id: number): Observable<{ trip: DriverTrip }> {
    return this.withOfflineFallback(
      this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/trips/${id}/arrive`, {}),
      () => this.offline.updateDriverTrip(id, 'arrive'),
    );
  }

  startDriverTrip(id: number): Observable<{ trip: DriverTrip }> {
    return this.withOfflineFallback(
      this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/trips/${id}/start`, {}),
      () => this.offline.updateDriverTrip(id, 'start'),
    );
  }

  completeDriverTrip(
    id: number,
    actualDistanceKm: number,
    actualDurationMin: number,
  ): Observable<{ trip: DriverTrip }> {
    return this.withOfflineFallback(
      this.http.post<{ trip: DriverTrip }>(`${this.apiUrl}/driver/trips/${id}/complete`, {
        actual_distance_km: actualDistanceKm,
        actual_duration_min: actualDurationMin,
      }),
      () => this.offline.updateDriverTrip(id, 'complete', actualDistanceKm, actualDurationMin),
    );
  }

  updateDriverLocation(
    location: Coordinates & { heading?: number; speed?: number; trip_id?: number },
  ): Observable<unknown> {
    return this.withOfflineFallback(this.http.post(`${this.apiUrl}/driver/location`, location), () =>
      this.offline.updateDriverLocation(location),
    );
  }

  private withOfflineFallback<T>(source: Observable<T>, fallback: () => T): Observable<T> {
    if (this.offline.isLocalSession()) {
      this.offline.setOfflineMode(true);
      return defer(() => of(fallback()));
    }

    return source.pipe(
      tap(() => this.offline.setOfflineMode(false)),
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 0) {
          return throwError(() => error);
        }

        this.offline.setOfflineMode(true);
        return defer(() => of(fallback()));
      }),
    );
  }
}
