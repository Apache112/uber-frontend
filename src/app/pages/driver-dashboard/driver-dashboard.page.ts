import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

const ACTIVE_TRIP_KEY = 'driver_active_trip';

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

  ngOnInit(): void {
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
