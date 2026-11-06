import { CommonModule, DatePipe } from '@angular/common';
import type { OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { apiErrorMessage } from '../../services/api-error';
import type { ClientTrip } from '../../services/api.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-trip-history',
  templateUrl: './trip-history.page.html',
  styleUrls: ['./trip-history.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonSelect,
    IonSelectOption,
    IonText,
    IonTextarea,
    IonTitle,
    IonToolbar,
    CommonModule,
    DatePipe,
    FormsModule,
    RouterModule,
  ],
})
export class TripHistoryPage implements OnInit {
  private api = inject(ApiService);

  trips: ClientTrip[] = [];
  ratedTripIds = new Set<number>();
  ratingScores: Record<number, number> = {};
  ratingComments: Record<number, string> = {};
  ratingIncidents: Record<number, boolean> = {};
  isLoading = false;
  submittingTripId?: number;
  errorMessage = '';
  successMessage = '';
  paymentMethod: Record<number, 'nequi' | 'daviplata' | ''> = {};
  paymentReceipts: Record<number, { method: 'nequi' | 'daviplata'; paidAt: string; amount: number }> = {};

  constructor() {
    try {
      this.paymentReceipts = JSON.parse(
        localStorage.getItem('demo_payment_receipts') || '{}',
      ) as typeof this.paymentReceipts;
    } catch (error) {
      console.error('No se pudieron leer los comprobantes guardados.', error);
    }
  }

  ngOnInit(): void {
    this.loadTrips();
  }

  loadTrips(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.api.getClientTrips().subscribe({
      next: (response) => {
        this.trips = response.trips.data;
        this.isLoading = false;
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo cargar el historial de viajes.');
        this.isLoading = false;
      },
    });
  }

  submitRating(trip: ClientTrip): void {
    const score = this.ratingScores[trip.id];
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      this.errorMessage = 'Selecciona una calificación de 1 a 5 estrellas.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.submittingTripId = trip.id;
    this.api
      .rateClientTrip(trip.id, {
        score,
        comment: this.ratingComments[trip.id] || '',
        has_incident: this.ratingIncidents[trip.id] || false,
      })
      .subscribe({
        next: (response) => {
          this.ratedTripIds.add(trip.id);
          this.successMessage = response.message || 'Calificación enviada.';
          this.submittingTripId = undefined;
        },
        error: (error: unknown) => {
          this.errorMessage = apiErrorMessage(error, 'No se pudo enviar la calificación.');
          this.submittingTripId = undefined;
        },
      });
  }

  recordDemoPayment(trip: ClientTrip): void {
    const method = this.paymentMethod[trip.id];
    if (!method || trip.final_fare == null) {
      this.errorMessage = 'Selecciona un método y verifica que el viaje tenga una tarifa final.';
      return;
    }

    const receipt = {
      method,
      paidAt: new Date().toISOString(),
      amount: trip.final_fare,
    };
    const receipts = { ...this.paymentReceipts, [trip.id]: receipt };
    try {
      localStorage.setItem('demo_payment_receipts', JSON.stringify(receipts));
      this.paymentReceipts = receipts;
      this.errorMessage = '';
      this.successMessage = 'Pago de demostración registrado. No se realizó ningún cobro real.';
    } catch (error) {
      this.errorMessage = 'No se pudo guardar el comprobante en este dispositivo.';
      console.error('No se pudo guardar el comprobante de demostración.', error);
    }
  }

  paymentMethodLabel(method: 'nequi' | 'daviplata'): string {
    return method === 'nequi' ? 'Nequi' : 'Daviplata';
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
}
