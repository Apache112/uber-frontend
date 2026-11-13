import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { apiFallbackInterceptor } from '../interceptors/api-fallback-interceptor';

import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiFallbackInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('uses the local fare calculator when the API is unreachable', () => {
    let fare = 0;
    service
      .estimateFare({
        origin_latitude: 4.65,
        origin_longitude: -74.05,
        destination_latitude: 4.7,
        destination_longitude: -74.1,
      })
      .subscribe((response) => {
        fare = response.estimate.estimated_fare;
      });

    httpTestingController
      .expectOne(`${environment.apiUrl}/client/estimate-fare`)
      .flush(null, { status: 0, statusText: 'Network Error' });

    expect(fare).toBeGreaterThan(0);
  });

  it('updates driver approval through the admin endpoint', () => {
    let message = '';
    service.adminApproval(12, 'approved', 'Documentación verificada').subscribe((response) => {
      message = response.message;
    });

    const request = httpTestingController.expectOne(`${environment.apiUrl}/admin/drivers/12/approval`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      approval_status: 'approved',
      admin_notes: 'Documentación verificada',
    });
    request.flush({ success: true, message: 'Conductor aprobado.' });

    expect(message).toBe('Conductor aprobado.');
  });

  it('loads the active public fare configuration', () => {
    let activeFare = '';
    service.activeFare().subscribe((response) => {
      activeFare = response.fare.name;
    });

    const request = httpTestingController.expectOne(`${environment.apiUrl}/fares/active`);
    expect(request.request.method).toBe('GET');
    request.flush({
      success: true,
      fare: {
        name: 'Tarifa urbana',
        base_fare: 3800,
        price_per_km: 1250,
        price_per_minute: 250,
        minimum_fare: 6500,
        surge_multiplier: 1,
        active: true,
      },
    });

    expect(activeFare).toBe('Tarifa urbana');
  });

  it('requests trips filtered by status for the admin panel', () => {
    service.adminTrips('in progress').subscribe();

    const request = httpTestingController.expectOne(`${environment.apiUrl}/admin/trips?status=in%20progress`);
    expect(request.request.method).toBe('GET');
    request.flush({ success: true, trips: [] });
  });
});
