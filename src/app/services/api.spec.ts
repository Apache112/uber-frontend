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
});
