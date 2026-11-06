import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type * as L from 'leaflet';

import { ClientDashboardPage } from './client-dashboard.page';

const leafletMocks = vi.hoisted(() => ({
  map: vi.fn(),
  tileLayer: vi.fn(),
  zoom: vi.fn(),
  circle: vi.fn(),
  circleMarker: vi.fn(),
}));

vi.mock('leaflet', () => ({
  ...leafletMocks,
  control: { zoom: leafletMocks.zoom },
}));

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
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('creates a Gmail draft with the estimated ride details', () => {
    component.rideForm.origin_name = 'Neiva';
    component.rideForm.destination_name = 'Bogotá';
    component.invoiceEmail = 'pasajero@gmail.com';
    component.estimate = {
      distance_km: 12.5,
      duration_min: 30,
      estimated_fare: 25000,
      currency: 'COP',
    };

    const draftUrl = new URL(component.gmailDraftUrl());

    expect(draftUrl.origin).toBe('https://mail.google.com');
    expect(draftUrl.searchParams.get('to')).toBe('pasajero@gmail.com');
    expect(draftUrl.searchParams.get('su')).toContain('Neiva a Bogotá');
    expect(draftUrl.searchParams.get('body')).toContain('Distancia aproximada: 12.5 km');
    expect(draftUrl.searchParams.get('body')).toContain('no una factura tributaria');
  });

  it('opens Google Street View at the selected origin coordinates', () => {
    component.rideForm.origin_latitude = 2.954648;
    component.rideForm.origin_longitude = -75.285355;

    const streetViewUrl = new URL(component.streetViewUrl());

    expect(streetViewUrl.origin).toBe('https://www.google.com');
    expect(streetViewUrl.searchParams.get('api')).toBe('1');
    expect(streetViewUrl.searchParams.get('map_action')).toBe('pano');
    expect(streetViewUrl.searchParams.get('viewpoint')).toBe('2.954648,-75.285355');
  });

  it('uses the device GPS position to center the interactive map and set the ride origin', () => {
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
    const marker = {
      addTo: vi.fn().mockReturnThis(),
      bindTooltip: vi.fn().mockReturnThis(),
      setLatLng: vi.fn().mockReturnThis(),
    };
    const circle = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn().mockReturnThis(), setRadius: vi.fn() };
    const map = {
      addTo: vi.fn().mockReturnThis(),
      invalidateSize: vi.fn(),
      panTo: vi.fn(),
      remove: vi.fn(),
    };
    const tileLayer = { addTo: vi.fn().mockReturnThis() };
    const zoomControl = { addTo: vi.fn() };
    leafletMocks.map.mockReturnValue(map as unknown as L.Map);
    leafletMocks.tileLayer.mockReturnValue(tileLayer as unknown as L.TileLayer);
    leafletMocks.zoom.mockReturnValue(zoomControl as unknown as L.Control.Zoom);
    leafletMocks.circle.mockReturnValue(circle as unknown as L.Circle);
    leafletMocks.circleMarker.mockReturnValue(marker as unknown as L.CircleMarker);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
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
    fixture.detectChanges();
    expect(leafletMocks.map).toHaveBeenCalledOnce();
    expect(leafletMocks.tileLayer).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      expect.objectContaining({ maxZoom: 19 }),
    );
    expect(leafletMocks.circleMarker).toHaveBeenCalledWith(
      [position.coords.latitude, position.coords.longitude],
      expect.objectContaining({ fillColor: '#1677ff' }),
    );
    expect(watchPosition).toHaveBeenCalledOnce();
  });
});
