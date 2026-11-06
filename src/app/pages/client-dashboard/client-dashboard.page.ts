import { CommonModule } from '@angular/common';
import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Component, inject, ViewChild } from '@angular/core';
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
import * as L from 'leaflet';

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
  private map?: L.Map;
  private locationMarker?: L.CircleMarker;
  private accuracyCircle?: L.Circle;
  private mapElement?: HTMLDivElement;

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
  isTrackingLocation = false;
  readonly googleMapsApiKey = environment.googleMapsApiKey.trim();
  readonly mapProvider = this.googleMapsApiKey ? 'Google Maps' : 'OpenStreetMap';
  googleMapUrl?: SafeResourceUrl;
  locationAccuracy?: number;
  invoiceEmail = '';
  private lastMapUpdate?: { latitude: number; longitude: number; at: number };

  @ViewChild('mapElement')
  set mapContainer(element: ElementRef<HTMLDivElement> | undefined) {
    this.mapElement = element?.nativeElement;
    if (this.mapElement) {
      this.initializeMap();
    } else {
      this.destroyMap();
    }
  }

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
    this.destroyMap();
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

  gmailDraftUrl(): string {
    if (!this.estimate) {
      return 'https://mail.google.com/mail/';
    }

    const subject = `Cotización estimada de viaje - ${this.rideForm.origin_name} a ${this.rideForm.destination_name}`;
    const body = [
      'COTIZACIÓN ESTIMADA DE VIAJE',
      '',
      `Origen: ${this.rideForm.origin_name}`,
      `Destino: ${this.rideForm.destination_name}`,
      `Distancia aproximada: ${this.estimate.distance_km} km`,
      `Duración aproximada: ${this.estimate.duration_min} min`,
      `Tarifa estimada: ${this.formatCurrency(this.estimate.estimated_fare)}`,
      `Fecha: ${new Date().toLocaleString('es-CO')}`,
      '',
      'Este documento es una cotización previa, no una factura tributaria ni un cobro.',
      'La tarifa final se determina al completar el viaje.',
    ].join('\n');

    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: this.invoiceEmail.trim(),
      su: subject,
      body,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  updateGoogleMapFromOrigin(): void {
    const latitude = this.rideForm.origin_latitude;
    const longitude = this.rideForm.origin_longitude;
    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude))
    ) {
      this.googleMapUrl = undefined;
      return;
    }
    this.updateGoogleMapUrl(Number(latitude), Number(longitude));
  }

  private updateCurrentPosition(position: GeolocationPosition): void {
    const { latitude, longitude, accuracy } = position.coords;
    this.rideForm.origin_latitude = latitude;
    this.rideForm.origin_longitude = longitude;
    this.locationAccuracy = accuracy;
    this.updateGoogleMapUrl(latitude, longitude);
    this.updateMap(latitude, longitude, accuracy);
    this.errorMessage = '';
  }

  private updateGoogleMapUrl(latitude: number, longitude: number): void {
    if (!this.googleMapsApiKey) {
      return;
    }

    const params = new URLSearchParams({
      key: this.googleMapsApiKey,
      q: `${latitude},${longitude}`,
      center: `${latitude},${longitude}`,
      zoom: '17',
    });
    this.googleMapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.google.com/maps/embed/v1/search?${params.toString()}`,
    );
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

  private updateMap(latitude: number, longitude: number, accuracy: number): void {
    const now = Date.now();
    const last = this.lastMapUpdate;
    if (last && this.distanceMeters(last.latitude, last.longitude, latitude, longitude) < 5) {
      this.locationMarker?.setLatLng([latitude, longitude]);
      this.accuracyCircle?.setLatLng([latitude, longitude]).setRadius(accuracy);
      return;
    }

    this.lastMapUpdate = { latitude, longitude, at: now };
    this.initializeMap(latitude, longitude, accuracy);
  }

  private initializeMap(latitude?: number, longitude?: number, accuracy?: number): void {
    const currentLatitude = latitude ?? this.rideForm.origin_latitude;
    const currentLongitude = longitude ?? this.rideForm.origin_longitude;
    const currentAccuracy = accuracy ?? this.locationAccuracy;
    if (!this.mapElement || currentLatitude == null || currentLongitude == null || currentAccuracy == null) {
      return;
    }

    const position: L.LatLngExpression = [currentLatitude, currentLongitude];
    if (!this.map) {
      this.map = L.map(this.mapElement, {
        center: position,
        zoom: 15,
        zoomControl: false,
        scrollWheelZoom: false,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(this.map);
      L.control.zoom({ position: 'topright' }).addTo(this.map);
      this.accuracyCircle = L.circle(position, {
        radius: currentAccuracy,
        color: '#3182ce',
        weight: 1,
        fillColor: '#3182ce',
        fillOpacity: 0.12,
      }).addTo(this.map);
      this.locationMarker = L.circleMarker(position, {
        radius: 9,
        color: '#ffffff',
        weight: 4,
        fillColor: '#1677ff',
        fillOpacity: 1,
      }).addTo(this.map);
      this.locationMarker.bindTooltip('Tu ubicación', { direction: 'top', offset: [0, -8] });
      requestAnimationFrame(() => this.map?.invalidateSize());
      return;
    }

    this.locationMarker?.setLatLng(position);
    this.accuracyCircle?.setLatLng(position).setRadius(currentAccuracy);
    this.map.panTo(position, { animate: true, duration: 0.4 });
  }

  private destroyMap(): void {
    this.map?.remove();
    this.map = undefined;
    this.locationMarker = undefined;
    this.accuracyCircle = undefined;
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
