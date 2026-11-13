import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import type { AdminDashboard, AdminDriver, AdminFare, AdminTrip } from '../../services/api.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

type AdminTab = 'dashboard' | 'drivers' | 'fares' | 'trips' | 'reports' | 'audit';
type ApprovalStatus = 'approved' | 'suspended' | 'rejected';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-dashboard.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    JsonPipe,
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
  ],
})
export class AdminDashboardPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly tabs: { id: AdminTab; label: string }[] = [
    { id: 'dashboard', label: 'Resumen' },
    { id: 'drivers', label: 'Conductores' },
    { id: 'fares', label: 'Tarifas' },
    { id: 'trips', label: 'Viajes' },
    { id: 'reports', label: 'Reportes' },
    { id: 'audit', label: 'Auditoría' },
  ];

  tab: AdminTab = 'dashboard';
  loading = false;
  errorMessage = '';
  successMessage = '';
  driverFilter = 'pending';
  tripFilter = '';
  approvalInProgress?: number;
  dashboardStats?: AdminDashboard['stats'];
  drivers: AdminDriver[] = [];
  fares: AdminFare[] = [];
  trips: AdminTrip[] = [];
  reports: unknown;
  auditLogs: unknown;
  fare: AdminFare = {
    name: '',
    base_fare: 3800,
    price_per_km: 1250,
    price_per_minute: 250,
    minimum_fare: 6500,
    surge_multiplier: 1,
    active: false,
  };
  isCreatingFare = false;

  ngOnInit(): void {
    this.load();
  }

  selectTab(tab: AdminTab): void {
    this.tab = tab;
    this.load();
  }

  tabTitle(): string {
    return this.tabs.find((item) => item.id === this.tab)?.label ?? 'Administración';
  }

  load(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.loading = true;

    switch (this.tab) {
      case 'dashboard':
        this.api.adminDashboard().subscribe({
          next: (response) => {
            this.dashboardStats = response.stats;
            this.loading = false;
          },
          error: (error: unknown) => this.failLoad(error, 'No se pudo cargar el resumen administrativo.'),
        });
        break;
      case 'drivers':
        this.api.adminDrivers(this.driverFilter || undefined).subscribe({
          next: (response) => {
            this.drivers = response.drivers;
            this.loading = false;
          },
          error: (error: unknown) => this.failLoad(error, 'No se pudieron cargar los conductores.'),
        });
        break;
      case 'fares':
        this.api.adminFares().subscribe({
          next: (response) => {
            this.fares = response.fares;
            this.loading = false;
          },
          error: (error: unknown) => this.failLoad(error, 'No se pudieron cargar las tarifas.'),
        });
        break;
      case 'trips':
        this.api.adminTrips(this.tripFilter || undefined).subscribe({
          next: (response) => {
            this.trips = Array.isArray(response.trips) ? response.trips : response.trips.data;
            this.loading = false;
          },
          error: (error: unknown) => this.failLoad(error, 'No se pudieron cargar los viajes.'),
        });
        break;
      case 'reports':
        this.api.adminReports().subscribe({
          next: (response) => {
            this.reports = response;
            this.loading = false;
          },
          error: (error: unknown) => this.failLoad(error, 'No se pudo cargar el reporte.'),
        });
        break;
      case 'audit':
        this.api.adminAuditLogs().subscribe({
          next: (response) => {
            this.auditLogs = response;
            this.loading = false;
          },
          error: (error: unknown) => this.failLoad(error, 'No se pudo cargar la auditoría.'),
        });
        break;
    }
  }

  statList(): { label: string; value: number }[] {
    const stats = this.dashboardStats;
    if (!stats) {
      return [];
    }

    const fields: { key: keyof typeof stats; label: string }[] = [
      { key: 'total_clients', label: 'Clientes' },
      { key: 'total_drivers', label: 'Conductores' },
      { key: 'pending_drivers', label: 'Conductores pendientes' },
      { key: 'approved_drivers', label: 'Conductores aprobados' },
      { key: 'active_trips', label: 'Viajes activos' },
      { key: 'completed_trips', label: 'Viajes completados' },
      { key: 'cancelled_trips', label: 'Viajes cancelados' },
      { key: 'pending_requests', label: 'Solicitudes pendientes' },
    ];

    return fields.flatMap(({ key, label }) => {
      const value = stats[key];
      return value == null ? [] : [{ label, value }];
    });
  }

  approve(driver: AdminDriver, status: ApprovalStatus): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.approvalInProgress = driver.id;
    this.api.adminApproval(driver.id, status, `Cambio a ${status} desde el panel`).subscribe({
      next: (response) => {
        this.approvalInProgress = undefined;
        this.load();
        this.successMessage = response.message || 'Estado del conductor actualizado.';
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo actualizar el estado del conductor.');
        this.approvalInProgress = undefined;
      },
    });
  }

  createFare(): void {
    if (!this.isFareValid()) {
      this.errorMessage = 'Revisa el nombre y los valores de la tarifa antes de guardarla.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isCreatingFare = true;
    const fare: AdminFare = {
      ...this.fare,
      name: this.fare.name.trim(),
      base_fare: Number(this.fare.base_fare),
      price_per_km: Number(this.fare.price_per_km),
      price_per_minute: Number(this.fare.price_per_minute),
      minimum_fare: Number(this.fare.minimum_fare),
      surge_multiplier: Number(this.fare.surge_multiplier),
    };
    this.api.adminCreateFare(fare).subscribe({
      next: (response) => {
        this.isCreatingFare = false;
        this.fare = { ...this.fare, name: '' };
        this.load();
        this.successMessage = response.message || 'Tarifa guardada.';
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo guardar la tarifa.');
        this.isCreatingFare = false;
      },
    });
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
      next: () => {
        void this.router.navigateByUrl('/login');
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo cerrar la sesión.');
      },
    });
  }

  private isFareValid(): boolean {
    const amounts = [
      this.fare.base_fare,
      this.fare.price_per_km,
      this.fare.price_per_minute,
      this.fare.minimum_fare,
    ].map(Number);
    const surgeMultiplier = Number(this.fare.surge_multiplier);

    return (
      this.fare.name.trim().length > 0 &&
      amounts.every((value) => Number.isFinite(value) && value >= 0) &&
      Number.isFinite(surgeMultiplier) &&
      surgeMultiplier > 0
    );
  }

  private failLoad(error: unknown, fallback: string): void {
    this.errorMessage = apiErrorMessage(error, fallback);
    this.loading = false;
  }
}
