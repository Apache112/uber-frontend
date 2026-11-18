import { Injectable } from '@angular/core';

import type {
  AdminDashboard,
  AdminDriver,
  AdminFare,
  AdminTrip,
  ClientActiveResponse,
  ClientTrip,
  Coordinates,
  DriverTrip,
  RideEstimate,
  RideEstimateRequest,
  RideRequest,
  RideRequestPayload,
} from './api.service';
import type { AuthResponse, RegisterPayload } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class OfflineDataService {
  private offlineMode = false;

  private mockDrivers: AdminDriver[] = [
    {
      id: 1,
      license_number: 'LC-88291-CO',
      approval_status: 'approved',
      rating_average: 4.95,
      user: { name: 'Carlos Rodríguez', email: 'carlos@uber.com' },
      vehicles: [{ plate: 'UBR-123', brand: 'Chevrolet', model: 'Onix Turbo', year: 2023 }],
    },
  ];

  private mockFares: AdminFare[] = [
    {
      id: 1,
      name: 'Tarifa Estándar Urbana',
      base_fare: 3800,
      price_per_km: 1250,
      price_per_minute: 250,
      minimum_fare: 6500,
      surge_multiplier: 1.0,
      active: true,
    },
  ];

  private mockAdminTrips: AdminTrip[] = [];
  private mockAuditLogs = [
    {
      id: 1,
      action: 'SYSTEM_BOOT_OFFLINE',
      user: 'admin@uber.com',
      description: 'Modo local inicializado.',
      created_at: new Date().toISOString(),
    },
  ];

  private driverLocation: Coordinates = { latitude: 4.6766, longitude: -74.0483 };
  private clientTrips: ClientTrip[] = [];

  // Getters y Setters persistentes en localStorage para sincronizar pestañas (Cliente y Conductor)
  private get activeRequest(): RideRequest | null {
    const data = localStorage.getItem('offline_active_request');
    return data ? JSON.parse(data) : null;
  }
  private set activeRequest(req: RideRequest | null) {
    if (req) localStorage.setItem('offline_active_request', JSON.stringify(req));
    else localStorage.removeItem('offline_active_request');
  }

  private get activeDriverTrip(): DriverTrip | null {
    const data = localStorage.getItem('offline_active_trip');
    return data ? JSON.parse(data) : null;
  }
  private set activeDriverTrip(trip: DriverTrip | null) {
    if (trip) localStorage.setItem('offline_active_trip', JSON.stringify(trip));
    else localStorage.removeItem('offline_active_trip');
  }

  isLocalSession(): boolean {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token') || '';
    return token.startsWith('offline_') || token.startsWith('local_');
  }

  setOfflineMode(value: boolean): void {
    this.offlineMode = value;
  }

  isOfflineMode(): boolean {
    return this.offlineMode;
  }

  loginOrCreateLocalPassenger(credentials: { login: string; password: string }): AuthResponse {
    const loginClean = credentials.login.trim().toLowerCase();
    if (loginClean === 'admin@uber.com') {
      return {
        success: true,
        access_token: 'local_admin_token_' + Date.now(),
        user: { role: 'admin' },
        message: 'Sesión administrativa local iniciada',
      };
    }
    const role = loginClean.includes('driver') || loginClean.includes('conductor') ? 'driver' : 'client';
    return {
      success: true,
      access_token: `local_${role}_token_` + Date.now(),
      user: { role },
      message: 'Sesión local iniciada',
    };
  }

  register(userData: RegisterPayload): AuthResponse {
    return {
      success: true,
      access_token: `local_${userData.role}_token_` + Date.now(),
      user: { role: userData.role },
      message: 'Usuario registrado localmente',
    };
  }

  logout(): { success: boolean; message: string } {
    localStorage.clear();
    return { success: true, message: 'Sesión cerrada' };
  }

  async cacheOnlineCredentials(_l: string, _p: string, _r: string, _pr?: RegisterPayload): Promise<void> {}

  estimateFare(coords: RideEstimateRequest): RideEstimate {
    const active = this.mockFares.find((f) => f.active) ?? this.mockFares[0];
    const distanceKm = Math.max(1.0, this.calculateDistanceKm(
      coords.origin_latitude,
      coords.origin_longitude,
      coords.destination_latitude,
      coords.destination_longitude,
    ));
    const durationMin = Math.max(3, Math.round(distanceKm * 3));
    const rawFare = (active.base_fare + distanceKm * active.price_per_km + durationMin * active.price_per_minute) * active.surge_multiplier;
    const estimatedFare = Math.max(active.minimum_fare, Math.round(rawFare / 100) * 100);

    return {
      distance_km: Number(distanceKm.toFixed(2)),
      duration_min: durationMin,
      estimated_fare: estimatedFare,
      currency: 'COP',
    };
  }

  createRideRequest(rideData: RideRequestPayload): { ride_request: RideRequest } {
    const estimate = this.estimateFare(rideData);
    const newRequest: RideRequest = {
      id: Math.floor(Math.random() * 900) + 100,
      origin_name: rideData.origin_name || 'KOKKO',
      destination_name: rideData.destination_name || 'Japon',
      origin_latitude: rideData.origin_latitude ?? 4.6766,
      origin_longitude: rideData.origin_longitude ?? -74.0483,
      destination_latitude: rideData.destination_latitude ?? 4.6664,
      destination_longitude: rideData.destination_longitude ?? -74.0536,
      estimated_distance_km: estimate.distance_km,
      estimated_duration_min: estimate.duration_min,
      estimated_fare: estimate.estimated_fare,
      status: 'requested',
      client: { name: 'Cliente Local', phone: '3001234567' },
    };

    this.activeRequest = newRequest;
    return { ride_request: newRequest };
  }

  getClientActive(): ClientActiveResponse {
    const trip = this.activeDriverTrip;
    const req = this.activeRequest;

    if (trip) {
      return {
        has_active: true,
        type: 'trip',
        data: {
          ...trip,
          driver: {
            user: { name: 'Carlos Rodríguez', phone: '3119876543' },
            latest_location: this.driverLocation,
          },
          vehicle: { plate: 'UBR-123', brand: 'Chevrolet', model: 'Onix', color: 'Gris' },
        },
      };
    }
    if (req) {
      return {
        has_active: true,
        type: 'request',
        data: req,
      };
    }
    return { has_active: false };
  }

  cancelClientRide(_id: number, reason: string): { message: string } {
    this.activeRequest = null;
    this.activeDriverTrip = null;
    return { message: `Solicitud cancelada (${reason})` };
  }

  getClientTrips(): { trips: { data: ClientTrip[] } } {
    return { trips: { data: [...this.clientTrips] } };
  }

  rateClientTrip(id: number, rating: { score: number; comment: string; has_incident: boolean }): { message: string } {
    const trip = this.clientTrips.find((t) => t.id === id);
    if (trip) trip.rating = { score: rating.score };
    return { message: 'Calificación guardada.' };
  }

  getActiveFare(): { success: boolean; fare: AdminFare } {
    return { success: true, fare: this.mockFares[0] };
  }

  toggleAvailability(status: 'available' | 'unavailable'): { availability_status: 'available' | 'unavailable' } {
    return { availability_status: status };
  }

  getAvailableRequests(): { requests: RideRequest[] } {
    const rawData = localStorage.getItem('offline_active_request');
    if (!rawData) {
      return { requests: [] };
    }
    try {
      const req = JSON.parse(rawData) as RideRequest;
      if (req && (req.status === 'requested' || !req.status)) {
        return { 
          requests: [{
            id: req.id || 101,
            origin_name: req.origin_name || 'KOKKO',
            destination_name: req.destination_name || 'Japon',
            estimated_distance_km: req.estimated_distance_km || 2.5,
            estimated_duration_min: req.estimated_duration_min || 5,
            estimated_fare: req.estimated_fare || 8500,
            status: 'requested',
            client: req.client || { name: 'Cliente Local', phone: '3001234567' }
          }] 
        };
      }
      return { requests: [] };
    } catch {
      return { requests: [] };
    }
  }

  acceptRideRequest(id: number): { trip: DriverTrip } {
    const req = this.activeRequest;
    this.activeDriverTrip = {
      id,
      status: 'assigned',
      estimated_fare: req?.estimated_fare ?? 8500,
      estimated_distance_km: req?.estimated_distance_km ?? 2.5,
      estimated_duration_min: req?.estimated_duration_min ?? 7,
      origin_name: req?.origin_name ?? 'KOKKO',
      destination_name: req?.destination_name ?? 'Japon',
    };
    this.activeRequest = null;
    return { trip: this.activeDriverTrip };
  }

  updateDriverTrip(id: number, action: 'arrive' | 'start' | 'complete'): { trip: DriverTrip } {
    let trip = this.activeDriverTrip ?? { id, status: 'assigned' };
    if (action === 'arrive') {
      trip.status = 'driver_arrived';
    } else if (action === 'start') {
      trip.status = 'in_progress';
    } else if (action === 'complete') {
      const finalFare = trip.estimated_fare ?? 8500;
      trip.status = 'completed';
      trip.final_fare = finalFare;
      this.clientTrips.unshift({
        id,
        status: 'completed',
        final_fare: finalFare,
        completed_at: new Date().toISOString(),
        driver: { user: { name: 'Carlos Rodríguez' } },
        vehicle: { plate: 'UBR-123' },
      });
      const completed = { ...trip };
      this.activeDriverTrip = null;
      return { trip: completed };
    }
    this.activeDriverTrip = trip;
    return { trip };
  }

  updateDriverLocation(location: Coordinates): { success: boolean; location: Coordinates } {
    this.driverLocation = { latitude: location.latitude, longitude: location.longitude };
    return { success: true, location: this.driverLocation };
  }

  getAdminDashboard(): AdminDashboard {
    return {
      success: true,
      stats: {
        total_clients: 5,
        total_drivers: this.mockDrivers.length,
        pending_drivers: 1,
        approved_drivers: 1,
        active_trips: this.activeDriverTrip ? 1 : 0,
        completed_trips: this.clientTrips.length,
        cancelled_trips: 0,
        pending_requests: this.activeRequest ? 1 : 0,
        total_revenue: 15000,
      },
    };
  }

  getAdminDrivers(approvalStatus?: string): { success: boolean; drivers: AdminDriver[] } {
    const filtered = approvalStatus ? this.mockDrivers.filter((d) => d.approval_status === approvalStatus) : this.mockDrivers;
    return { success: true, drivers: [...filtered] };
  }

  updateAdminApproval(id: number, approvalStatus: 'approved' | 'suspended' | 'rejected', notes: string): { success: boolean; message: string; driver?: AdminDriver } {
    const d = this.mockDrivers.find((item) => item.id === id);
    if (d) d.approval_status = approvalStatus;
    return { success: true, message: `Conductor actualizado a ${approvalStatus} (${notes})`, driver: d };
  }

  getAdminFares(): { success: boolean; fares: AdminFare[] } {
    return { success: true, fares: [...this.mockFares] };
  }

  createAdminFare(fare: AdminFare): { success: boolean; message: string; fare: AdminFare } {
    const newFare = { ...fare, id: this.mockFares.length + 1 };
    this.mockFares.unshift(newFare);
    return { success: true, message: 'Tarifa creada', fare: newFare };
  }

  getAdminTrips(_status?: string): { success: boolean; trips: AdminTrip[] } {
    return { success: true, trips: [...this.mockAdminTrips] };
  }

  getAdminReports(): unknown {
    return { success: true, message: 'Reporte generado' };
  }

  getAdminAuditLogs(): unknown {
    return { success: true, logs: this.mockAuditLogs };
  }

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (val: number) => (val * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
}