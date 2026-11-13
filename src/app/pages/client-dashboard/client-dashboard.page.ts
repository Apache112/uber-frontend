import { CommonModule } from '@angular/common';
import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Component, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import {
  IonButton,
  IonButtons,
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
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-client-dashboard',
  templateUrl: './client-dashboard.page.html',
  styleUrls: ['./client-dashboard.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
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
  private auth = inject(AuthService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private activeRefreshTimer?: ReturnType<typeof setInterval>;
  private locationWatchId?: number;
  private map?: L.Map;
  private locationMarker?: L.CircleMarker;
  private destinationMarker?: L.CircleMarker;
  private routeLine?: L.Polyline;
  private accuracyCircle?: L.Circle;
  private mapElement?: HTMLDivElement;
  private activeRouteMap?: L.Map;
  private activeRouteMapElement?: HTMLDivElement;
  private activeOriginMarker?: L.CircleMarker;
  private activeDestinationMarker?: L.CircleMarker;
  private activeDriverMarker?: L.CircleMarker;
  private activeRouteLine?: L.Polyline;

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

  @ViewChild('activeRouteMap')
  set activeRouteMapContainer(element: ElementRef<HTMLDivElement> | undefined) {
    this.activeRouteMapElement = element?.nativeElement;
    if (this.activeRouteMapElement) {
      this.initializeActiveRouteMap();
    } else {
      this.destroyActiveRouteMap();
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

  hasActiveRouteCoordinates(ride: NonNullable<ClientActiveResponse['data']>): ride is NonNullable<
    ClientActiveResponse['data']
  > & {
    origin_latitude: number;
    origin_longitude: number;
    destination_latitude: number;
    destination_longitude: number;
  } {
    return (
      ride.origin_latitude != null &&
      ride.origin_longitude != null &&
      ride.destination_latitude != null &&
      ride.destination_longitude != null &&
      Number.isFinite(ride.origin_latitude) &&
      Number.isFinite(ride.origin_longitude) &&
      Number.isFinite(ride.destination_latitude) &&
      Number.isFinite(ride.destination_longitude)
    );
  }

  ngOnDestroy(): void {
    if (this.activeRefreshTimer) {
      clearInterval(this.activeRefreshTimer);
    }
    this.stopLocationWatch();
    this.destroyMap();
    this.destroyActiveRouteMap();
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        void this.router.navigateByUrl('/login');
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo cerrar la sesión.');
      },
    });
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
        this.applyRideCoordinates(response.ride_request);
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
        if (response.data) {
          this.applyRideCoordinates(response.data);
        }
        this.updateActiveRouteMap();
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
      this.updateRouteMap();
      return;
    }
    this.updateGoogleMapUrl(Number(latitude), Number(longitude));
    this.updateRouteMap();
  }

  updateRouteMap(): void {
    if (!this.map) {
      this.initializeMap();
      return;
    }

    this.syncRouteLayers(true);
  }

  streetViewUrl(): string {
    const latitude = this.rideForm.origin_latitude;
    const longitude = this.rideForm.origin_longitude;
    if (latitude == null || longitude == null) {
      return 'https://www.google.com/maps';
    }

    const params = new URLSearchParams({
      api: '1',
      map_action: 'pano',
      viewpoint: `${latitude},${longitude}`,
    });
    return `https://www.google.com/maps/@?${params.toString()}`;
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
    if (!this.mapElement || currentLatitude == null || currentLongitude == null) {
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
      if (currentAccuracy != null) {
        this.accuracyCircle = L.circle(position, {
          radius: currentAccuracy,
          color: '#3182ce',
          weight: 1,
          fillColor: '#3182ce',
          fillOpacity: 0.12,
        }).addTo(this.map);
      }
      this.locationMarker = L.circleMarker(position, {
        radius: 9,
        color: '#ffffff',
        weight: 4,
        fillColor: '#1677ff',
        fillOpacity: 1,
      }).addTo(this.map);
      this.locationMarker.bindTooltip('Tu ubicación', { direction: 'top', offset: [0, -8] });
      this.syncRouteLayers(true);
      requestAnimationFrame(() => this.map?.invalidateSize());
      return;
    }

    this.locationMarker?.setLatLng(position);
    if (currentAccuracy != null) {
      if (this.accuracyCircle) {
        this.accuracyCircle.setLatLng(position).setRadius(currentAccuracy);
      } else {
        this.accuracyCircle = L.circle(position, {
          radius: currentAccuracy,
          color: '#3182ce',
          weight: 1,
          fillColor: '#3182ce',
          fillOpacity: 0.12,
        }).addTo(this.map);
      }
    }
    this.map.panTo(position, { animate: true, duration: 0.4 });
    this.syncRouteLayers();
  }

  private syncRouteLayers(fitRoute = false): void {
    if (!this.map) {
      return;
    }

    const originLatitude = Number(this.rideForm.origin_latitude);
    const originLongitude = Number(this.rideForm.origin_longitude);
    const destinationLatitude = Number(this.rideForm.destination_latitude);
    const destinationLongitude = Number(this.rideForm.destination_longitude);
    const hasRoute =
      this.rideForm.origin_latitude != null &&
      this.rideForm.origin_longitude != null &&
      this.rideForm.destination_latitude != null &&
      this.rideForm.destination_longitude != null &&
      Number.isFinite(originLatitude) &&
      Number.isFinite(originLongitude) &&
      Number.isFinite(destinationLatitude) &&
      Number.isFinite(destinationLongitude);

    if (!hasRoute) {
      this.destinationMarker?.remove();
      this.destinationMarker = undefined;
      this.routeLine?.remove();
      this.routeLine = undefined;
      return;
    }

    const origin: L.LatLngExpression = [originLatitude, originLongitude];
    const destination: L.LatLngExpression = [destinationLatitude, destinationLongitude];
    if (!this.destinationMarker) {
      this.destinationMarker = L.circleMarker(destination, {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#e44747',
        fillOpacity: 1,
      }).addTo(this.map);
      this.destinationMarker.bindTooltip('Destino', { direction: 'top', offset: [0, -8] });
    } else {
      this.destinationMarker.setLatLng(destination);
    }

    if (!this.routeLine) {
      this.routeLine = L.polyline([origin, destination], {
        color: '#1677ff',
        weight: 5,
        opacity: 0.8,
      }).addTo(this.map);
    } else {
      this.routeLine.setLatLngs([origin, destination]);
    }

    if (fitRoute) {
      this.map.fitBounds(this.routeLine.getBounds(), { padding: [36, 36], maxZoom: 15 });
    }
  }

  private destroyMap(): void {
    this.map?.remove();
    this.map = undefined;
    this.locationMarker = undefined;
    this.destinationMarker = undefined;
    this.routeLine = undefined;
    this.accuracyCircle = undefined;
  }

  private initializeActiveRouteMap(): void {
    const ride = this.activeRide?.data;
    if (!this.activeRouteMapElement || !ride || !this.hasActiveRouteCoordinates(ride)) {
      return;
    }

    const origin: L.LatLngExpression = [ride.origin_latitude, ride.origin_longitude];
    const destination: L.LatLngExpression = [ride.destination_latitude, ride.destination_longitude];
    if (!this.activeRouteMap) {
      this.activeRouteMap = L.map(this.activeRouteMapElement, {
        center: origin,
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: false,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(this.activeRouteMap);
      this.activeOriginMarker = L.circleMarker(origin, {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1677ff',
        fillOpacity: 1,
      })
        .addTo(this.activeRouteMap)
        .bindTooltip('Origen', { direction: 'top', offset: [0, -8] });
      this.activeDestinationMarker = L.circleMarker(destination, {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#e44747',
        fillOpacity: 1,
      })
        .addTo(this.activeRouteMap)
        .bindTooltip('Destino', { direction: 'top', offset: [0, -8] });
      this.activeRouteLine = L.polyline([origin, destination], {
        color: '#1677ff',
        weight: 5,
        opacity: 0.8,
      }).addTo(this.activeRouteMap);

      const bounds = this.activeRouteLine.getBounds();
      const driverLocation = ride.driver?.latest_location;
      if (driverLocation && this.hasValidLocation(driverLocation.latitude, driverLocation.longitude)) {
        this.activeDriverMarker = this.createDriverMarker(driverLocation, this.activeRouteMap);
        bounds.extend([driverLocation.latitude, driverLocation.longitude]);
      }
      this.activeRouteMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
      requestAnimationFrame(() => this.activeRouteMap?.invalidateSize());
      return;
    }

    this.activeOriginMarker?.setLatLng(origin);
    this.activeDestinationMarker?.setLatLng(destination);
    this.activeRouteLine?.setLatLngs([origin, destination]);
    this.updateActiveDriverMarker(ride.driver?.latest_location);
  }

  private updateActiveRouteMap(): void {
    if (this.activeRouteMapElement) {
      this.initializeActiveRouteMap();
    }
  }

  private updateActiveDriverMarker(location?: { latitude: number; longitude: number }): void {
    if (!location || !this.hasValidLocation(location.latitude, location.longitude)) {
      this.activeDriverMarker?.remove();
      this.activeDriverMarker = undefined;
      return;
    }

    if (this.activeDriverMarker) {
      this.activeDriverMarker.setLatLng([location.latitude, location.longitude]);
    } else if (this.activeRouteMap) {
      this.activeDriverMarker = this.createDriverMarker(location, this.activeRouteMap);
    }
  }

  private createDriverMarker(location: { latitude: number; longitude: number }, map: L.Map): L.CircleMarker {
    return L.circleMarker([location.latitude, location.longitude], {
      radius: 10,
      color: '#ffffff',
      weight: 3,
      fillColor: '#16a085',
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip('Conductor', { direction: 'top', offset: [0, -8] });
  }

  private hasValidLocation(latitude: number, longitude: number): boolean {
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }

  private destroyActiveRouteMap(): void {
    this.activeRouteMap?.remove();
    this.activeRouteMap = undefined;
    this.activeOriginMarker = undefined;
    this.activeDestinationMarker = undefined;
    this.activeDriverMarker = undefined;
    this.activeRouteLine = undefined;
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

  directionsUrl(): string {
    const params = new URLSearchParams({
      api: '1',
      origin: `${this.rideForm.origin_latitude},${this.rideForm.origin_longitude}`,
      destination: `${this.rideForm.destination_latitude},${this.rideForm.destination_longitude}`,
      travelmode: 'driving',
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
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

  private applyRideCoordinates(ride: NonNullable<ClientActiveResponse['data']>): void {
    if (
      ride.origin_latitude == null ||
      ride.origin_longitude == null ||
      ride.destination_latitude == null ||
      ride.destination_longitude == null
    ) {
      return;
    }

    this.rideForm.origin_name = ride.origin_name || this.rideForm.origin_name;
    this.rideForm.origin_latitude = ride.origin_latitude;
    this.rideForm.origin_longitude = ride.origin_longitude;
    this.rideForm.destination_name = ride.destination_name || this.rideForm.destination_name;
    this.rideForm.destination_latitude = ride.destination_latitude;
    this.rideForm.destination_longitude = ride.destination_longitude;
    this.updateRouteMap();
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
