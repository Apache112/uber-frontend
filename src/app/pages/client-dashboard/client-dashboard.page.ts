import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
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

import { environment } from '../../../environments/environment';
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
  private sanitizer = inject(DomSanitizer);
  private activeRefreshTimer?: ReturnType<typeof setInterval>;
  private locationWatchId?: number;

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
  mapUrl?: SafeResourceUrl;
  isTrackingLocation = false;
  mapProvider: 'Google Maps' | 'OpenStreetMap' = environment.googleMapsApiKey ? 'Google Maps' : 'OpenStreetMap';
  locationAccuracy?: number;
  private lastMapUpdate?: { latitude: number; longitude: number; at: number };

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
    this.stopLocationWatch();
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

    if (this.locationWatchId != null) {
      return;
    }

    this.isTrackingLocation = true;
    navigator.geolocation.getCurrentPosition(
      (position) => this.updateCurrentPosition(position),
      (error) => this.handleLocationError(error, false),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    this.locationWatchId = navigator.geolocation.watchPosition(
      (position) => this.updateCurrentPosition(position),
      (error) => this.handleLocationError(error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  stopLocationWatch(): void {
    if (this.locationWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = undefined;
    }
    this.isTrackingLocation = false;
  }

  private updateCurrentPosition(position: GeolocationPosition): void {
    const { latitude, longitude, accuracy } = position.coords;
    this.rideForm.origin_latitude = latitude;
    this.rideForm.origin_longitude = longitude;
    this.locationAccuracy = accuracy;
    this.updateMap(latitude, longitude);
    this.errorMessage = '';
  }

  private handleLocationError(error: GeolocationPositionError, stopTracking = true): void {
    if (stopTracking) {
      this.isTrackingLocation = false;
      if (this.locationWatchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.locationWatchId);
        this.locationWatchId = undefined;
      }
    }

    this.errorMessage =
      error.code === error.PERMISSION_DENIED
        ? 'Permite el acceso a la ubicación en el navegador para mostrar tu posición real.'
        : error.code === error.POSITION_UNAVAILABLE
          ? 'El dispositivo no pudo determinar la ubicación. Activa el GPS y prueba al aire libre.'
          : 'La ubicación tardó demasiado. Comprueba el GPS, los permisos y que la página use HTTPS.';
  }

  private updateMap(latitude: number, longitude: number): void {
    const now = Date.now();
    const last = this.lastMapUpdate;
    if (last && now - last.at < 10000 && this.distanceMeters(last.latitude, last.longitude, latitude, longitude) < 10) {
      return;
    }

    this.lastMapUpdate = { latitude, longitude, at: now };
    const key = environment.googleMapsApiKey.trim();
    const url = key
      ? this.googleMapsEmbedUrl(key, latitude, longitude)
      : this.openStreetMapEmbedUrl(latitude, longitude);
    this.mapProvider = key ? 'Google Maps' : 'OpenStreetMap';
    this.mapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  private googleMapsEmbedUrl(key: string, latitude: number, longitude: number): string {
    const query = new URLSearchParams({
      key,
      center: `${latitude},${longitude}`,
      zoom: '17',
    });
    return `https://www.google.com/maps/embed/v1/view?${query.toString()}`;
  }

  private openStreetMapEmbedUrl(latitude: number, longitude: number): string {
    const longitudeDelta = 0.008;
    const latitudeDelta = 0.005;
    const bounds = [
      longitude - longitudeDelta,
      latitude - latitudeDelta,
      longitude + longitudeDelta,
      latitude + latitudeDelta,
    ].join(',');
    const query = new URLSearchParams({
      bbox: bounds,
      layer: 'mapnik',
      marker: `${latitude},${longitude}`,
    });
    return `https://www.openstreetmap.org/export/embed.html?${query.toString()}`;
  }

  private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(lat2 - lat1);
    const longitudeDelta = radians(lon2 - lon1);
    const value =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
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
