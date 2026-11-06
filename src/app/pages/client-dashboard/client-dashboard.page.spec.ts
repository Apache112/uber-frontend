import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ClientDashboardPage } from './client-dashboard.page';

describe('ClientDashboardPage', () => {
  let component: ClientDashboardPage;
  let fixture: ComponentFixture<ClientDashboardPage>;
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ClientDashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the device GPS position to center the map and set the ride origin', () => {
    const position = {
      coords: {
        latitude: 2.956725,
        longitude: -75.277921,
        accuracy: 8,
      },
    } as GeolocationPosition;
    const watchPosition = vi.fn((success: PositionCallback) => {
      success(position);
      return 1;
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success(position)),
        watchPosition,
        clearWatch: vi.fn(),
      },
    });

    component.useCurrentLocation();

    expect(component.rideForm.origin_latitude).toBe(position.coords.latitude);
    expect(component.rideForm.origin_longitude).toBe(position.coords.longitude);
    expect(component.locationAccuracy).toBe(position.coords.accuracy);
    expect(component.mapProvider).toBe('OpenStreetMap');
    expect(component.mapUrl).toBeDefined();
    expect(watchPosition).toHaveBeenCalledOnce();
  });
});
