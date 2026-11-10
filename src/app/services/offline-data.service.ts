import { Injectable, signal } from '@angular/core';

import type {
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

interface OfflineUser extends Partial<RegisterPayload> {
  id: number;
  name: string;
  login: string;
  passwordHash?: string;
  role: 'client' | 'driver';
  availability: 'available' | 'unavailable';
  latestLocation?: Coordinates;
}

interface OfflineRide extends RideRequestPayload {
  id: number;
  clientId: number;
  status: string;
  estimated_distance_km: number;
  estimated_fare: number;
  estimated_duration_min: number;
  created_at: string;
  driverId?: number;
  final_fare?: number;
  completed_at?: string;
  rating?: { score: number; comment?: string; has_incident?: boolean };
}

interface OfflineDatabase {
  users: OfflineUser[];
  rides: OfflineRide[];
  nextUserId: number;
  nextRideId: number;
}

const DATABASE_KEY = 'uber_offline_database';
const USER_ID_KEY = 'offline_user_id';
const OFFLINE_MODE_KEY = 'offline_mode';

@Injectable({ providedIn: 'root' })
export class OfflineDataService {
  readonly isOfflineMode = signal(localStorage.getItem(OFFLINE_MODE_KEY) === 'true');

  setOfflineMode(enabled: boolean): void {
    if (enabled) {
      localStorage.setItem(OFFLINE_MODE_KEY, 'true');
    } else {
      localStorage.removeItem(OFFLINE_MODE_KEY);
    }
    this.isOfflineMode.set(enabled);
  }

  isLocalSession(): boolean {
    return localStorage.getItem('access_token')?.startsWith('offline-') ?? false;
  }

  async login(credentials: { login: string; password: string }): Promise<AuthResponse> {
    const login = credentials.login.trim().toLowerCase();
    const user = this.database().users.find(
      (candidate) =>
        candidate.login.toLowerCase() === login ||
        candidate.email?.toLowerCase() === login ||
        candidate.phone === credentials.login.trim(),
    );

    if (!user?.passwordHash || !(await this.passwordMatches(credentials.password, user.passwordHash))) {
      throw new Error('No hay una cuenta local con esos datos. Regístrate mientras estás sin conexión.');
    }

    localStorage.setItem(USER_ID_KEY, String(user.id));
    this.setOfflineMode(true);
    return this.authResponse(user);
  }

  async loginOrCreateLocalPassenger(credentials: { login: string; password: string }): Promise<AuthResponse> {
    const login = credentials.login.trim();
    const password = credentials.password;

    if (!login || !password) {
      throw new Error('Escribe tu correo o teléfono y tu contraseña para entrar.');
    }

    const normalizedLogin = login.toLowerCase();
    const database = this.database();
    const existingUser = database.users.find(
      (candidate) =>
        candidate.login.toLowerCase() === normalizedLogin ||
        candidate.email?.toLowerCase() === normalizedLogin ||
        candidate.phone === login,
    );

    if (existingUser) {
      return this.login(credentials);
    }

    const user: OfflineUser = {
      id: database.nextUserId++,
      name: login.includes('@') ? login.split('@')[0] : login,
      login: normalizedLogin,
      ...(login.includes('@') ? { email: normalizedLogin } : { phone: login }),
      passwordHash: await this.hashPassword(password),
      role: 'client',
      availability: 'unavailable',
    };
    database.users.push(user);
    this.saveDatabase(database);
    localStorage.setItem(USER_ID_KEY, String(user.id));
    this.setOfflineMode(true);
    return {
      ...this.authResponse(user),
      message: 'Sesión local de pasajero. La cuenta no pudo verificarse con el servidor.',
    };
  }

  async register(userData: RegisterPayload): Promise<AuthResponse> {
    const database = this.database();
    const email = userData.email.trim().toLowerCase();

    if (database.users.some((user) => user.email?.toLowerCase() === email)) {
      throw new Error('Ya existe una cuenta local con ese correo.');
    }

    const user: OfflineUser = {
      ...userData,
      id: database.nextUserId++,
      name: userData.name.trim(),
      login: email,
      passwordHash: await this.hashPassword(userData.password),
      availability: 'unavailable',
    };
    database.users.push(user);
    this.saveDatabase(database);
    localStorage.setItem(USER_ID_KEY, String(user.id));
    this.setOfflineMode(true);
    return this.authResponse(user);
  }

  async cacheOnlineCredentials(
    login: string,
    password: string,
    role: string,
    profile?: RegisterPayload,
  ): Promise<void> {
    if (role !== 'client' && role !== 'driver') {
      return;
    }

    const database = this.database();
    const normalizedLogin = login.trim().toLowerCase();
    let user = database.users.find(
      (candidate) =>
        candidate.login.toLowerCase() === normalizedLogin ||
        candidate.email?.toLowerCase() === normalizedLogin ||
        candidate.phone === login.trim(),
    );

    if (!user) {
      user = {
        id: database.nextUserId++,
        name: profile?.name.trim() || login.trim(),
        login: normalizedLogin,
        email: profile?.email,
        phone: profile?.phone,
        role,
        availability: 'unavailable',
      };
      database.users.push(user);
    } else if (profile) {
      Object.assign(user, profile);
    }

    user.role = role;
    user.passwordHash = await this.hashPassword(password);
    this.saveDatabase(database);
  }

  logout(): { success: boolean; message: string } {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    return { success: true, message: 'Sesión local cerrada.' };
  }

  estimateFare(coords: RideEstimateRequest): RideEstimate {
    const distance = this.distanceKm(
      coords.origin_latitude,
      coords.origin_longitude,
      coords.destination_latitude,
      coords.destination_longitude,
    );
    const duration = Math.max(1, Math.round((distance / 30) * 60));

    return {
      distance_km: Number(distance.toFixed(2)),
      duration_min: duration,
      estimated_fare: Math.round(5000 + distance * 1500 + duration * 200),
      currency: 'COP',
    };
  }

  createRideRequest(payload: RideRequestPayload): { ride_request: RideRequest } {
    const database = this.database();
    const client = this.currentUser(database);
    const estimate = this.estimateFare(payload);
    const ride: OfflineRide = {
      ...payload,
      id: database.nextRideId++,
      clientId: client.id,
      status: 'requested',
      estimated_distance_km: estimate.distance_km,
      estimated_fare: estimate.estimated_fare,
      estimated_duration_min: estimate.duration_min,
      created_at: new Date().toISOString(),
    };
    database.rides.push(ride);
    this.saveDatabase(database);
    return { ride_request: this.rideRequest(ride, client) };
  }

  getClientActive(): ClientActiveResponse {
    const database = this.database();
    const client = this.currentUser(database);
    const ride = database.rides
      .filter((item) => item.clientId === client.id && !['completed', 'cancelled'].includes(item.status))
      .sort((a, b) => b.id - a.id)[0];

    if (!ride) {
      return { has_active: false };
    }

    const driver = database.users.find((user) => user.id === ride.driverId);
    return {
      has_active: true,
      type: ride.status === 'requested' ? 'request' : 'trip',
      data: {
        id: ride.id,
        status: ride.status,
        estimated_fare: ride.estimated_fare,
        estimated_distance_km: ride.estimated_distance_km,
        estimated_duration_min: ride.estimated_duration_min,
        origin_name: ride.origin_name,
        origin_latitude: ride.origin_latitude,
        origin_longitude: ride.origin_longitude,
        destination_name: ride.destination_name,
        destination_latitude: ride.destination_latitude,
        destination_longitude: ride.destination_longitude,
        ...(driver
          ? {
              driver: {
                user: { name: driver.name, phone: driver.phone },
                latest_location: driver.latestLocation,
              },
              vehicle: {
                plate: driver.plate || 'Sin placa',
                brand: driver.brand,
                model: driver.model,
                color: driver.color,
              },
            }
          : {}),
      },
    };
  }

  cancelClientRide(id: number, _reason: string): { message: string } {
    const database = this.database();
    const ride = this.findRideForClient(database, id);
    if (ride.status === 'in_progress') {
      throw new Error('No se puede cancelar un viaje que ya comenzó.');
    }
    ride.status = 'cancelled';
    this.saveDatabase(database);
    return { message: 'Viaje cancelado en este dispositivo.' };
  }

  getClientTrips(): { trips: { data: ClientTrip[] } } {
    const database = this.database();
    const client = this.currentUser(database);
    const data = database.rides
      .filter((ride) => ride.clientId === client.id)
      .sort((a, b) => b.id - a.id)
      .map((ride) => ({
        id: ride.id,
        status: ride.status,
        final_fare: ride.final_fare,
        completed_at: ride.completed_at,
        rating: ride.rating,
      }));
    return { trips: { data } };
  }

  rateClientTrip(id: number, rating: { score: number; comment?: string; has_incident?: boolean }): { message: string } {
    const database = this.database();
    const ride = this.findRideForClient(database, id);
    if (ride.status !== 'completed') {
      throw new Error('Solo puedes calificar viajes completados.');
    }
    ride.rating = rating;
    this.saveDatabase(database);
    return { message: 'Calificación guardada en este dispositivo.' };
  }

  toggleAvailability(status: 'available' | 'unavailable'): {
    availability_status: 'available' | 'unavailable';
  } {
    const database = this.database();
    const driver = this.currentUser(database);
    if (driver.role !== 'driver') {
      throw new Error('Esta función solo está disponible para cuentas de conductor.');
    }
    driver.availability = status;
    this.saveDatabase(database);
    return { availability_status: status };
  }

  getAvailableRequests(): { requests: RideRequest[] } {
    const database = this.database();
    const driver = this.currentUser(database);
    if (driver.role !== 'driver') {
      throw new Error('Esta función solo está disponible para cuentas de conductor.');
    }
    return {
      requests: database.rides
        .filter((ride) => ride.status === 'requested' && ride.clientId !== driver.id)
        .map((ride) =>
          this.rideRequest(
            ride,
            database.users.find((user) => user.id === ride.clientId),
          ),
        ),
    };
  }

  acceptRideRequest(id: number): { trip: DriverTrip } {
    const database = this.database();
    const driver = this.currentUser(database);
    const ride = database.rides.find((item) => item.id === id && item.status === 'requested');
    if (!ride) {
      throw new Error('La solicitud ya no está disponible.');
    }
    ride.status = 'assigned';
    ride.driverId = driver.id;
    this.saveDatabase(database);
    return { trip: this.driverTrip(ride) };
  }

  updateDriverTrip(
    id: number,
    action: 'arrive' | 'start' | 'complete',
    distance?: number,
    duration?: number,
  ): {
    trip: DriverTrip;
  } {
    const database = this.database();
    const ride = database.rides.find((item) => item.id === id && item.driverId === this.currentUser(database).id);
    if (!ride) {
      throw new Error('No se encontró el viaje activo de este conductor.');
    }

    if (action === 'arrive' && ride.status === 'assigned') {
      ride.status = 'driver_arrived';
    } else if (action === 'start' && ride.status === 'driver_arrived') {
      ride.status = 'in_progress';
    } else if (action === 'complete' && ride.status === 'in_progress' && distance && duration) {
      ride.status = 'completed';
      ride.final_fare = Math.round(5000 + distance * 1500 + duration * 200);
      ride.completed_at = new Date().toISOString();
    } else {
      throw new Error('La acción no es válida para el estado actual del viaje.');
    }
    this.saveDatabase(database);
    return { trip: { ...this.driverTrip(ride), final_fare: ride.final_fare } };
  }

  updateDriverLocation(location: Coordinates): { success: boolean } {
    const database = this.database();
    const driver = this.currentUser(database);
    driver.latestLocation = location;
    this.saveDatabase(database);
    return { success: true };
  }

  private authResponse(user: OfflineUser): AuthResponse {
    return {
      success: true,
      access_token: `offline-${user.id}`,
      user: { role: user.role },
      message: 'Sesión local: los datos se guardan solo en este dispositivo.',
    };
  }

  private database(): OfflineDatabase {
    const stored = localStorage.getItem(DATABASE_KEY);
    if (!stored) {
      return { users: [], rides: [], nextUserId: 1, nextRideId: 1 };
    }
    try {
      return JSON.parse(stored) as OfflineDatabase;
    } catch (error) {
      throw new Error('No se pudieron leer los datos locales guardados.', { cause: error });
    }
  }

  private saveDatabase(database: OfflineDatabase): void {
    localStorage.setItem(DATABASE_KEY, JSON.stringify(database));
  }

  private currentUser(database: OfflineDatabase): OfflineUser {
    const id = Number(localStorage.getItem(USER_ID_KEY));
    const user = database.users.find((candidate) => candidate.id === id);
    if (user) {
      return user;
    }

    const role = localStorage.getItem('user_role');
    if (localStorage.getItem('access_token') && (role === 'client' || role === 'driver')) {
      const sessionUser: OfflineUser = {
        id: database.nextUserId++,
        name: 'Usuario local',
        login: `local-${role}-${Date.now()}`,
        role,
        availability: 'unavailable',
      };
      database.users.push(sessionUser);
      this.saveDatabase(database);
      localStorage.setItem(USER_ID_KEY, String(sessionUser.id));
      localStorage.setItem('access_token', `offline-${sessionUser.id}`);
      return sessionUser;
    }

    throw new Error('Inicia sesión con una cuenta guardada en este dispositivo para usar el modo local.');
  }

  private findRideForClient(database: OfflineDatabase, id: number): OfflineRide {
    const client = this.currentUser(database);
    const ride = database.rides.find((item) => item.id === id && item.clientId === client.id);
    if (!ride) {
      throw new Error('No se encontró el viaje solicitado.');
    }
    return ride;
  }

  private rideRequest(ride: OfflineRide, client?: OfflineUser): RideRequest {
    return {
      id: ride.id,
      origin_name: ride.origin_name,
      destination_name: ride.destination_name,
      origin_latitude: ride.origin_latitude,
      origin_longitude: ride.origin_longitude,
      destination_latitude: ride.destination_latitude,
      destination_longitude: ride.destination_longitude,
      estimated_distance_km: ride.estimated_distance_km,
      estimated_duration_min: ride.estimated_duration_min,
      estimated_fare: ride.estimated_fare,
      status: ride.status,
      ...(client ? { client: { name: client.name, phone: client.phone } } : {}),
    };
  }

  private driverTrip(ride: OfflineRide): DriverTrip {
    return {
      id: ride.id,
      status: ride.status,
      estimated_fare: ride.estimated_fare,
      estimated_distance_km: ride.estimated_distance_km,
      estimated_duration_min: ride.estimated_duration_min,
      origin_name: ride.origin_name,
      origin_latitude: ride.origin_latitude,
      origin_longitude: ride.origin_longitude,
      destination_name: ride.destination_name,
      destination_latitude: ride.destination_latitude,
      destination_longitude: ride.destination_longitude,
    };
  }

  private distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(lat2 - lat1);
    const longitudeDelta = radians(lon2 - lon1);
    const value =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltString = Array.from(salt, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${saltString}:${await this.digest(password, saltString)}`;
  }

  private async passwordMatches(password: string, storedHash: string): Promise<boolean> {
    const [salt, expectedHash] = storedHash.split(':');
    return !!salt && !!expectedHash && (await this.digest(password, salt)) === expectedHash;
  }

  private async digest(password: string, salt: string): Promise<string> {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
  }
}
