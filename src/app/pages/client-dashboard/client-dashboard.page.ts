import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { apiErrorMessage } from '../../services/api-error';
import type { ClientActiveResponse, RideEstimate, RideRequestPayload } from '../../services/api.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-client-dashboard',
  templateUrl: './client-dashboard.page.html',
  styleUrls: ['./client-dashboard.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonText,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    RouterModule,
  ],
})
export class ClientDashboardPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private activeRefreshTimer?: ReturnType<typeof setInterval>;

  rideForm = {
    origin_name: '',
    origin_latitude: null as number | null,
    origin_longitude: null as number | null,
    destination_name: '',
    destination_latitude: null as number | null,
    destination_longitude: null as number | null,
  };

  estimate?: RideEstimate;
  activeRide?: ClientActiveResponse;
  errorMessage = '';
  successMessage = '';
  isEstimating = false;
  isRequestingRide = false;
  isRefreshing = false;
  isCancelling = false;

  ngOnInit(): void {
    this.refreshActiveRide();
    this.activeRefreshTimer = setInterval(() => {
      if (this.activeRide?.has_active) {
        this.refreshActiveRide(false);
      }
    }, 15000);
  }

  ngOnDestroy(): void {
    if (this.activeRefreshTimer) {
      clearInterval(this.activeRefreshTimer);
    }
  }

  estimateFare(): void {
    if (!this.hasValidCoordinates()) {
      this.errorMessage = 'Escribe origen, destino y coordenadas válidas.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isEstimating = true;
    this.api.estimateFare(this.coordinates()).subscribe({
      next: (response) => {
        this.estimate = response.estimate;
        this.isEstimating = false;
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo calcular la tarifa.');
        this.isEstimating = false;
      },
    });
  }

  requestRide(): void {
    if (!this.hasValidCoordinates()) {
      this.errorMessage = 'Escribe origen, destino y coordenadas válidas.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isRequestingRide = true;
    const request: RideRequestPayload = {
      ...this.coordinates(),
      origin_name: this.rideForm.origin_name.trim(),
      destination_name: this.rideForm.destination_name.trim(),
    };

    this.api.createRideRequest(request).subscribe({
      next: (response) => {
        this.successMessage = 'Solicitud enviada. Buscando conductor disponible.';
        this.activeRide = {
          has_active: true,
          type: 'request',
          data: response.ride_request,
        };
        this.estimate = undefined;
        this.isRequestingRide = false;
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo solicitar el viaje.');
        this.isRequestingRide = false;
        this.refreshActiveRide(false);
      },
    });
  }

  refreshActiveRide(showLoading = true): void {
    if (showLoading) {
      this.isRefreshing = true;
    }

    this.api.getClientActive().subscribe({
      next: (response) => {
        this.activeRide = response;
        this.isRefreshing = false;
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo consultar el viaje activo.');
        this.isRefreshing = false;
      },
    });
  }

  cancelRide(): void {
    const id = this.activeRide?.data?.id;
    if (!id) {
      return;
    }

    this.errorMessage = '';
    this.isCancelling = true;
    this.api.cancelClientRide(id, 'Cancelado por el cliente').subscribe({
      next: (response) => {
        this.successMessage = response.message || 'Viaje cancelado.';
        this.isCancelling = false;
        this.refreshActiveRide();
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo cancelar el viaje.');
        this.isCancelling = false;
      },
    });
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.errorMessage = 'Este navegador no permite consultar la ubicación.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.rideForm.origin_latitude = coords.latitude;
        this.rideForm.origin_longitude = coords.longitude;
        this.errorMessage = '';
      },
      (error) => {
        this.errorMessage =
          error.code === error.PERMISSION_DENIED
            ? 'Permite el acceso a tu ubicación o escribe las coordenadas del origen.'
            : 'No se pudo obtener tu ubicación. Escribe las coordenadas del origen.';
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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

  statusLabel(status?: string): string {
    const labels: Record<string, string> = {
      requested: 'Buscando conductor',
      assigned: 'Conductor asignado',
      driver_arrived: 'El conductor llegó al origen',
      in_progress: 'Viaje en curso',
      completed: 'Completado',
      cancelled: 'Cancelado',
    };
    return status ? labels[status] || status : 'Estado no disponible';
  }

  private hasValidCoordinates() {
    const values = [
      this.rideForm.origin_latitude,
      this.rideForm.origin_longitude,
      this.rideForm.destination_latitude,
      this.rideForm.destination_longitude,
    ];
    return (
      this.rideForm.origin_name.trim().length > 0 &&
      this.rideForm.destination_name.trim().length > 0 &&
      values.every((value) => value != null && Number.isFinite(Number(value)))
    );
  }

  private coordinates() {
    return {
      origin_latitude: Number(this.rideForm.origin_latitude),
      origin_longitude: Number(this.rideForm.origin_longitude),
      destination_latitude: Number(this.rideForm.destination_latitude),
      destination_longitude: Number(this.rideForm.destination_longitude),
    };
  }
}
