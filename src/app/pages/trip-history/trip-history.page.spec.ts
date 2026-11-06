import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ApiService } from '../../services/api.service';

import { TripHistoryPage } from './trip-history.page';

describe('TripHistoryPage', () => {
  let component: TripHistoryPage;
  let fixture: ComponentFixture<TripHistoryPage>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: { getClientTrips: () => of({ trips: { data: [] } }) },
        },
      ],
    });
    fixture = TestBed.createComponent(TripHistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('records a clearly marked demo payment and local receipt', () => {
    component.paymentMethod[12] = 'nequi';
    component.recordDemoPayment({ id: 12, status: 'completed', final_fare: 18000 });

    expect(component.paymentReceipts[12].method).toBe('nequi');
    expect(component.paymentReceipts[12].amount).toBe(18000);
    expect(component.successMessage).toContain('No se realizó ningún cobro real');
    expect(JSON.parse(localStorage.getItem('demo_payment_receipts') || '{}')['12'].amount).toBe(18000);
  });
});
