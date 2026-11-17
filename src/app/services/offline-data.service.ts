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

  // --- ESTADO LOCAL DE CONDUCTORES, TARIFAS Y VIAJES (ADMIN) ---
  private mockDrivers: AdminDriver[] = [
    {
      id: 1,
      license_number: 'LC-88291-CO',
      approval_status: 'approved',
      rating_average: 4.95,
      user: { name: 'Carlos Rodríguez', email: 'carlos@uber.com' },
      vehicles: [{ plate: 'UBR-123', brand: 'Chevrolet', model: 'Onix Turbo', year: 2023 }],
    },
    {
      id: 2,
      license_number: 'LC-11928-CO',
      approval_status: 'pending',
      rating_average: 5.0,
      user: { name: 'Andrés Torres (Pendiente)', email: 'andres@uber.com' },
      vehicles: [{ plate: 'NEW-456', brand: 'Kia', model: 'Rio', year: 2024 }],
    },
    {
      id: 3,
      license_number: 'LC-44510-CO',
      approval_status: 'suspended',
      rating_average: 4.2,
      user: { name: 'Luis Gómez', email: 'luis@uber.com' },
      vehicles: [{ plate: 'XYZ-789', brand: 'Renault', model: 'Logan', year: 2021 }],
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
    {
      id: 2,
      name: 'Tarifa Hora Pico Nocturna',
      base_fare: 4500,
      price_per_km: 1500,
      price_per_minute: 350,
      minimum_fare: 8000,
      surge_multiplier: 1.3,
      active: false,
    },
  ];

  private mockAdminTrips: AdminTrip[] = [
    {
      id: 101,
      status: 'completed',
      final_fare: 9500,
      client_id: 2,
      driver_id: 1,
      client: { name: 'Juan Pérez' },
      driver: { user: { name: 'Carlos Rodríguez' } },
    },
    {
      id: 102,
      status: 'in_progress',
      estimated_fare: 12000,
      client_id: 3,
      driver_id: 1,
      client: { name: 'Daniela Morales' },
      driver: { user: { name: 'Carlos Rodríguez' } },
    },
    {
      id: 103,
      status: 'cancelled',
      estimated_fare: 6500,
      client_id: 2,
      client: { name: 'Juan Pérez' },
    },
  ];

  private mockAuditLogs = [
    {
      id: 1,
      action: 'SYSTEM_BOOT_OFFLINE',
      user: 'admin@uber.com',
      description: 'Modo administrador local inicializado sin servidor remoto.',
      created_at: new Date().toISOString(),
    },
  ];

  // --- ESTADO LOCAL DE CLIENTE Y CONDUCTOR ---
  private activeRequest: RideRequest | null = null;
  private activeDriverTrip: DriverTrip | null = null;
  private driverLocation: Coordinates = { latitude: 2.9273, longitude: -75.2819 };
  private clientTrips: ClientTrip[] = [
    {
      id: 101,
      status: 'completed',
      final_fare: 9500,
      completed_at: new Date(Date.now() - 86400000).toISOString(),
      driver: { user: { name: 'Carlos Rodríguez' } },
      vehicle: { plate: 'UBR-123' },
      rating: { score: 5 },
    },
  ];

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

  // --- MÉTODOS DE AUTENTICACIÓN OFFLINE (Compatibilidad con AuthService) ---
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

    const cachedRaw = localStorage.getItem(`offline_profile_${loginClean}`);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { role?: string };
        const role = cached.role || 'client';
        return {
          success: true,
          access_token: `local_${role}_token_` + Date.now(),
          user: { role },
          message: 'Sesión local recuperada',
        };
      } catch {
        // Si falla el parseo, continúa como cliente
      }
    }

    const role = loginClean.includes('conductor') || loginClean.includes('driver') ? 'driver' : 'client';
    return {
      success: true,
      access_token: `local_${role}_token_` + Date.now(),
      user: { role },
      message: 'Sesión local iniciada sin servidor',
    };
  }

  register(userData: RegisterPayload): AuthResponse {
    const emailClean = userData.email.trim().toLowerCase();
    void this.cacheOnlineCredentials(emailClean, userData.password, userData.role, userData);

    if (userData.role === 'driver') {
      this.mockDrivers.unshift({
        id: this.mockDrivers.length + 1,
        license_number: userData.license_number || 'LC-LOCAL-01',
        approval_status: 'pending',
        rating_average: 5.0,
        user: { name: userData.name, email: emailClean },
        vehicles: [
          {
            plate: userData.plate || 'LOC-000',
            brand: userData.brand || 'Genérico',
            model: userData.model || 'Estándar',
            year: userData.year || 2024,
          },
        ],
      });
    }

    return {
      success: true,
      access_token: `local_${userData.role}_token_` + Date.now(),
      user: { role: userData.role },
      message: 'Usuario registrado localmente',
    };
  }

  logout(): { success: boolean; message: string } {
    localStorage.removeItem('access_token');
    localStorage.removeItem('token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('offline_user_id');
    return { success: true, message: 'Sesión local cerrada exitosamente' };
  }

  async cacheOnlineCredentials(
    login: string,
    _password: string,
    role: string,
    profile?: RegisterPayload,
  ): Promise<void> {
    const key = `offline_profile_${login.trim().toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify({ login, role, profile }));
  }

  // --- MÉTODOS DE CLIENTE ---
  estimateFare(coords: RideEstimateRequest): RideEstimate {
    const active = this.mockFares.find((f) => f.active) ?? this.mockFares[0];
    const distanceKm = this.calculateDistanceKm(
      coords.origin_latitude,
      coords.origin_longitude,
      coords.destination_latitude,
      coords.destination_longitude,
    );
    const durationMin = Math.max(2, Math.round(distanceKm * 2.5));
    const rawFare =
      (active.base_fare + distanceKm * active.price_per_km + durationMin * active.price_per_minute) *
      active.surge_multiplier;
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
    this.activeRequest = {
      id: Math.floor(Math.random() * 900) + 200,
      origin_name: rideData.origin_name,
      destination_name: rideData.destination_name,
      origin_latitude: rideData.origin_latitude,
      origin_longitude: rideData.origin_longitude,
      destination_latitude: rideData.destination_latitude,
      destination_longitude: rideData.destination_longitude,
      estimated_distance_km: estimate.distance_km,
      estimated_duration_min: estimate.duration_min,
      estimated_fare: estimate.estimated_fare,
      status: 'requested',
      client: { name: 'Cliente Local', phone: '3001234567' },
    };
    return { ride_request: this.activeRequest };
  }

  getClientActive(): ClientActiveResponse {
    if (this.activeDriverTrip) {
      return {
        has_active: true,
        type: 'trip',
        data: {
          ...this.activeDriverTrip,
          driver: {
            user: { name: 'Carlos Rodríguez', phone: '3119876543' },
            latest_location: this.driverLocation,
          },
          vehicle: {
            plate: 'UBR-123',
            brand: 'Chevrolet',
            model: 'Onix Turbo',
            color: 'Gris Plata',
          },
        },
      };
    }
    if (this.activeRequest) {
      return {
        has_active: true,
        type: 'request',
        data: this.activeRequest,
      };
    }
    return { has_active: false };
  }

  cancelClientRide(id: number, reason: string): { message: string } {
    this.activeRequest = null;
    this.activeDriverTrip = null;
    this.mockAdminTrips.unshift({
      id,
      status: 'cancelled',
      estimated_fare: 6500,
      client: { name: 'Cliente Local' },
    });
    return { message: `Solicitud cancelada localmente (${reason})` };
  }

  getClientTrips(): { trips: { data: ClientTrip[] } } {
    return { trips: { data: [...this.clientTrips] } };
  }

  rateClientTrip(id: number, rating: { score: number; comment: string; has_incident: boolean }): { message: string } {
    const trip = this.clientTrips.find((t) => t.id === id);
    if (trip) {
      trip.rating = { score: rating.score };
    }
    return { message: 'Calificación registrada localmente.' };
  }

  getActiveFare(): { success: boolean; fare: AdminFare } {
    const active = this.mockFares.find((f) => f.active) ?? this.mockFares[0];
    return { success: true, fare: active };
  }

  // --- MÉTODOS DE CONDUCTOR ---
  toggleAvailability(status: 'available' | 'unavailable'): { availability_status: 'available' | 'unavailable' } {
    return { availability_status: status };
  }

  getAvailableRequests(): { requests: RideRequest[] } {
    return { requests: this.activeRequest ? [this.activeRequest] : [] };
  }

  acceptRideRequest(id: number): { trip: DriverTrip } {
    const req = this.activeRequest;
    this.activeDriverTrip = {
      id,
      status: 'assigned',
      estimated_fare: req?.estimated_fare ?? 8500,
      estimated_distance_km: req?.estimated_distance_km ?? 2.5,
      estimated_duration_min: req?.estimated_duration_min ?? 7,
      origin_name: req?.origin_name ?? 'Origen Local',
      origin_latitude: req?.origin_latitude ?? 2.9273,
      origin_longitude: req?.origin_longitude ?? -75.2819,
      destination_name: req?.destination_name ?? 'Destino Local',
      destination_latitude: req?.destination_latitude ?? 2.935,
      destination_longitude: req?.destination_longitude ?? -75.275,
    };
    this.activeRequest = null;
    return { trip: this.activeDriverTrip };
  }

  updateDriverTrip(
    id: number,
    action: 'arrive' | 'start' | 'complete',
    _actualDistanceKm?: number,
    _actualDurationMin?: number,
  ): { trip: DriverTrip } {
    if (!this.activeDriverTrip) {
      this.activeDriverTrip = { id, status: 'assigned' };
    }
    if (action === 'arrive') {
      this.activeDriverTrip.status = 'driver_arrived';
    } else if (action === 'start') {
      this.activeDriverTrip.status = 'in_progress';
    } else if (action === 'complete') {
      const finalFare = this.activeDriverTrip.estimated_fare ?? 8500;
      this.activeDriverTrip.status = 'completed';
      this.activeDriverTrip.final_fare = finalFare;
      this.clientTrips.unshift({
        id,
        status: 'completed',
        final_fare: finalFare,
        completed_at: new Date().toISOString(),
        driver: { user: { name: 'Carlos Rodríguez' } },
        vehicle: { plate: 'UBR-123' },
      });
      this.mockAdminTrips.unshift({
        id,
        status: 'completed',
        final_fare: finalFare,
        client: { name: 'Cliente Local' },
        driver: { user: { name: 'Carlos Rodríguez' } },
      });
      const completed = { ...this.activeDriverTrip };
      this.activeDriverTrip = null;
      return { trip: completed };
    }
    return { trip: this.activeDriverTrip };
  }

  updateDriverLocation(location: Coordinates): { success: boolean; location: Coordinates } {
    this.driverLocation = { latitude: location.latitude, longitude: location.longitude };
    return { success: true, location: this.driverLocation };
  }

  // --- MÉTODOS DE ADMINISTRADOR ---
  getAdminDashboard(): AdminDashboard {
    const pending = this.mockDrivers.filter((d) => d.approval_status === 'pending').length;
    const approved = this.mockDrivers.filter((d) => d.approval_status === 'approved').length;
    const completed = this.mockAdminTrips.filter((t) => t.status === 'completed').length;
    const cancelled = this.mockAdminTrips.filter((t) => t.status === 'cancelled').length;
    const active = this.mockAdminTrips.filter((t) => t.status === 'in_progress' || t.status === 'assigned').length;
    const revenue = this.mockAdminTrips
      .filter((t) => t.status === 'completed')
      .reduce((acc, t) => acc + (t.final_fare ?? 0), 0);

    return {
      success: true,
      stats: {
        total_clients: 14,
        total_drivers: this.mockDrivers.length,
        pending_drivers: pending,
        approved_drivers: approved,
        active_trips: active,
        completed_trips: completed,
        cancelled_trips: cancelled,
        pending_requests: this.activeRequest ? 1 : 0,
        total_revenue: revenue,
      },
    };
  }

  getAdminDrivers(approvalStatus?: string): { success: boolean; drivers: AdminDriver[] } {
    const filtered = approvalStatus
      ? this.mockDrivers.filter((d) => d.approval_status === approvalStatus)
      : this.mockDrivers;
    return { success: true, drivers: [...filtered] };
  }

  updateAdminApproval(
    id: number,
    approvalStatus: 'approved' | 'suspended' | 'rejected',
    adminNotes: string,
  ): { success: boolean; message: string; driver?: AdminDriver } {
    const driver = this.mockDrivers.find((d) => d.id === id);
    if (driver) {
      driver.approval_status = approvalStatus;
      this.mockAuditLogs.unshift({
        id: this.mockAuditLogs.length + 1,
        action: 'DRIVER_APPROVAL_UPDATED',
        user: 'admin@uber.com',
        description: `Conductor #${id} (${driver.user?.name}) cambiado a ${approvalStatus}. Nota: ${adminNotes}`,
        created_at: new Date().toISOString(),
      });
    }
    return {
      success: true,
      message: `Estado actualizado localmente a: ${approvalStatus}`,
      driver,
    };
  }

  getAdminFares(): { success: boolean; fares: AdminFare[] } {
    return { success: true, fares: [...this.mockFares] };
  }

  createAdminFare(fare: AdminFare): { success: boolean; message: string; fare: AdminFare } {
    if (fare.active) {
      this.mockFares.forEach((f) => (f.active = false));
    }
    const newFare: AdminFare = { ...fare, id: this.mockFares.length + 1 };
    this.mockFares.unshift(newFare);
    this.mockAuditLogs.unshift({
      id: this.mockAuditLogs.length + 1,
      action: 'FARE_CREATED',
      user: 'admin@uber.com',
      description: `Tarifa "${newFare.name}" creada localmente (Base: $${newFare.base_fare})`,
      created_at: new Date().toISOString(),
    });
    return { success: true, message: 'Tarifa guardada en modo local', fare: newFare };
  }

  getAdminTrips(status?: string): { success: boolean; trips: AdminTrip[] } {
    const filtered = status ? this.mockAdminTrips.filter((t) => t.status === status) : this.mockAdminTrips;
    return { success: true, trips: [...filtered] };
  }

  getAdminReports(): unknown {
    return {
      success: true,
      generated_at: new Date().toISOString(),
      summary: this.getAdminDashboard().stats,
      drivers_performance: this.mockDrivers.map((d) => ({
        id: d.id,
        name: d.user?.name,
        status: d.approval_status,
        rating: d.rating_average,
      })),
    };
  }

  getAdminAuditLogs(): unknown {
    return {
      success: true,
      total: this.mockAuditLogs.length,
      logs: this.mockAuditLogs,
    };
  }

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (val: number) => (val * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(0.5, R * c);
  }
}