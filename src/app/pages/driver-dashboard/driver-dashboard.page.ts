import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonInput,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { apiErrorMessage } from '../../services/api-error';
import type { DriverTrip, RideRequest } from '../../services/api.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

const ACTIVE_TRIP_KEY = 'driver_active_trip';
const DRIVER_EARNINGS_KEY = 'driver_demo_earnings';

interface DriverEarnings {
  tripIds: number[];
  total: number;
}

@Component({
  selector: 'app-driver-dashboard',
  templateUrl: './driver-dashboard.page.html',
  styleUrls: ['./driver-dashboard.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonInput,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
  ],
})
export class DriverDashboardPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private requestRefreshTimer?: ReturnType<typeof setInterval>;
  private locationWatchId?: number;

  isOnline = false;
  isUpdatingAvailability = false;
  isLoadingRequests = false;
  isAcceptingRequestId?: number;
  isUpdatingTrip = false;
  requests: RideRequest[] = [];
  activeTrip?: DriverTrip;
  errorMessage = '';
  infoMessage = '';
  locationMessage = '';
  actualDistanceKm: number | null = null;
  actualDurationMin: number | null = null;
  earnings: DriverEarnings = { tripIds: [], total: 0 };

  ngOnInit(): void {
    this.loadEarnings();
    const savedTrip = sessionStorage.getItem(ACTIVE_TRIP_KEY);
    if (savedTrip) {
      try {
        this.activeTrip = JSON.parse(savedTrip) as DriverTrip;
        this.isOnline = true;
        this.startLocationWatch();
      } catch {
        sessionStorage.removeItem(ACTIVE_TRIP_KEY);
        this.errorMessage = 'No se pudo recuperar el viaje activo guardado en este navegador.';
      }
    }
  }

  ngOnDestroy(): void {
    this.stopLocationWatch();
    if (this.requestRefreshTimer) {
      clearInterval(this.requestRefreshTimer);
    }
  }

  toggleAvailability(): void {
    const nextStatus = this.isOnline ? 'unavailable' : 'available';
    this.errorMessage = '';
    this.infoMessage = '';
    this.isUpdatingAvailability = true;

    this.api.toggleAvailability(nextStatus).subscribe({
      next: (response) => {
        this.isOnline = response.availability_status === 'available';
        this.isUpdatingAvailability = false;
        this.infoMessage = this.isOnline
          ? 'Estás conectado y puedes recibir solicitudes.'
          : 'Te desconectaste y ya no recibirás solicitudes.';

        if (this.isOnline) {
          this.loadRequests();
          this.startRequestPolling();
          this.startLocationWatch();
        } else {
          this.requests = [];
          this.stopRequestPolling();
          this.stopLocationWatch();
        }
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo cambiar la disponibilidad del conductor.');
        this.isUpdatingAvailability = false;
      },
    });
  }

  loadRequests(): void {
    if (!this.isOnline || this.isLoadingRequests) {
      return;
    }

    this.isLoadingRequests = true;
    this.api.getAvailableRequests().subscribe({
      next: (response) => {
        this.requests = response.requests;
        this.isLoadingRequests = false;
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudieron cargar las solicitudes de viaje.');
        this.isLoadingRequests = false;
      },
    });
  }

  acceptRequest(request: RideRequest): void {
    this.errorMessage = '';
    this.isAcceptingRequestId = request.id;
    this.api.acceptRideRequest(request.id).subscribe({
      next: (response) => {
        this.activeTrip = response.trip;
        this.saveActiveTrip();
        this.requests = this.requests.filter((item) => item.id !== request.id);
        this.isAcceptingRequestId = undefined;
        this.infoMessage = 'Servicio aceptado. Dirígete al punto de recogida.';
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(
          error,
          'No se pudo aceptar el servicio. Puede que otro conductor ya lo haya tomado.',
        );
        this.isAcceptingRequestId = undefined;
        this.loadRequests();
      },
    });
  }

  advanceTrip(action: 'arrive' | 'start' | 'complete'): void {
    const tripId = this.activeTrip?.id;
    if (!tripId) {
      return;
    }

    if (
      action === 'complete' &&
      (!this.isPositiveNumber(this.actualDistanceKm) || !this.isPositiveNumber(this.actualDurationMin))
    ) {
      this.errorMessage = 'Indica la distancia y duración reales del viaje.';
      return;
    }

    this.errorMessage = '';
    this.isUpdatingTrip = true;
    const request =
      action === 'arrive'
        ? this.api.markDriverArrived(tripId)
        : action === 'start'
          ? this.api.startDriverTrip(tripId)
          : this.api.completeDriverTrip(tripId, Number(this.actualDistanceKm), Number(this.actualDurationMin));

    request.subscribe({
      next: (response) => {
        this.isUpdatingTrip = false;
        if (action === 'complete') {
          this.recordEarning(tripId, response.trip.final_fare);
          this.infoMessage = `Viaje finalizado. Tarifa: ${this.formatCurrency(response.trip.final_fare)}.`;
          this.activeTrip = undefined;
          sessionStorage.removeItem(ACTIVE_TRIP_KEY);
          this.actualDistanceKm = null;
          this.actualDurationMin = null;
          this.loadRequests();
          return;
        }

        this.activeTrip = response.trip;
        this.saveActiveTrip();
        this.infoMessage =
          action === 'arrive'
            ? 'Llegada registrada. Ya puedes iniciar el viaje.'
            : 'Viaje iniciado. Al terminar, registra distancia y duración.';
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo actualizar el estado del viaje.');
        this.isUpdatingTrip = false;
      },
    });
  }

  statusLabel(status?: string): string {
    const labels: Record<string, string> = {
      assigned: 'Dirígete al punto de recogida',
      driver_arrived: 'Llegaste al punto de recogida',
      in_progress: 'Viaje en curso',
    };
    return status ? labels[status] || status : 'Estado no disponible';
  }

  formatCurrency(amount?: number): string {
    return amount == null
      ? '—'
      : new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0,
        }).format(amount);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo cerrar la sesión.');
      },
    });
  }

  private loadEarnings(): void {
    try {
      const saved = localStorage.getItem(DRIVER_EARNINGS_KEY);
      if (saved) {
        this.earnings = JSON.parse(saved) as DriverEarnings;
      }
    } catch (error) {
      this.errorMessage = 'No se pudieron leer las ganancias guardadas en este dispositivo.';
      console.error('Error al leer el resumen local de ganancias.', error);
    }
  }

  private recordEarning(tripId: number, amount?: number): void {
    if (amount == null || this.earnings.tripIds.includes(tripId)) {
      return;
    }

    const updated: DriverEarnings = {
      tripIds: [...this.earnings.tripIds, tripId],
      total: this.earnings.total + amount,
    };
    try {
      localStorage.setItem(DRIVER_EARNINGS_KEY, JSON.stringify(updated));
      this.earnings = updated;
    } catch (error) {
      this.infoMessage = 'Viaje finalizado, pero no se pudo guardar el resumen local de ganancias.';
      console.error('Error al guardar el resumen local de ganancias.', error);
    }
  }

  private startRequestPolling() {
    this.stopRequestPolling();
    this.requestRefreshTimer = setInterval(() => this.loadRequests(), 15000);
  }

  private stopRequestPolling() {
    if (this.requestRefreshTimer) {
      clearInterval(this.requestRefreshTimer);
      this.requestRefreshTimer = undefined;
    }
  }

  private startLocationWatch() {
    if (this.locationWatchId != null) {
      return;
    }
    if (!navigator.geolocation) {
      this.locationMessage = 'Este navegador no permite compartir ubicación GPS.';
      return;
    }

    this.locationWatchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const location: {
          latitude: number;
          longitude: number;
          heading?: number;
          speed?: number;
          trip_id?: number;
        } = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        if (coords.heading != null) {
          location.heading = coords.heading;
        }
        if (coords.speed != null) {
          location.speed = coords.speed;
        }
        if (this.activeTrip?.id) {
          location.trip_id = this.activeTrip.id;
        }

        this.api.updateDriverLocation(location).subscribe({
          next: () => {
            this.locationMessage = 'Ubicación GPS compartida.';
          },
          error: (error: unknown) => {
            this.locationMessage = apiErrorMessage(error, 'No se pudo actualizar tu ubicación en el servidor.');
          },
        });
      },
      (error) => {
        this.locationMessage =
          error.code === error.PERMISSION_DENIED
            ? 'Permite el acceso a tu ubicación para compartir tu posición.'
            : 'No se pudo obtener tu ubicación GPS.';
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  private stopLocationWatch() {
    if (this.locationWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = undefined;
    }
  }

  private saveActiveTrip() {
    if (this.activeTrip) {
      sessionStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(this.activeTrip));
    }
  }

  private isPositiveNumber(value: number | null): value is number {
    return value != null && Number.isFinite(value) && value > 0;
  }
}
