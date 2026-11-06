import { TestBed } from '@angular/core/testing';

import { OfflineDataService } from './offline-data.service';

describe('OfflineDataService', () => {
  let service: OfflineDataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(OfflineDataService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('stores local accounts and supports a complete local ride flow', async () => {
    await service.register({
      name: 'Cliente local',
      email: 'cliente@example.com',
      password: 'clave123',
      role: 'client',
    });

    const request = service.createRideRequest({
      origin_name: 'Origen',
      origin_latitude: 4.65,
      origin_longitude: -74.05,
      destination_name: 'Destino',
      destination_latitude: 4.7,
      destination_longitude: -74.1,
    }).ride_request;

    await service.register({
      name: 'Conductor local',
      email: 'conductor@example.com',
      password: 'clave456',
      role: 'driver',
    });
    service.toggleAvailability('available');
    expect(service.getAvailableRequests().requests).toHaveLength(1);

    service.acceptRideRequest(request.id);
    service.updateDriverTrip(request.id, 'arrive');
    service.updateDriverTrip(request.id, 'start');
    service.updateDriverTrip(request.id, 'complete', 5, 15);

    await service.login({ login: 'cliente@example.com', password: 'clave123' });
    expect(service.getClientTrips().trips.data[0].status).toBe('completed');
    expect(service.rateClientTrip(request.id, { score: 5 }).message).toContain('guardada');
  });

  it('estimates a fare locally from coordinates', () => {
    const estimate = service.estimateFare({
      origin_latitude: 4.65,
      origin_longitude: -74.05,
      destination_latitude: 4.7,
      destination_longitude: -74.1,
    });

    expect(estimate.distance_km).toBeGreaterThan(0);
    expect(estimate.duration_min).toBeGreaterThan(0);
    expect(estimate.estimated_fare).toBeGreaterThan(0);
    expect(estimate.currency).toBe('COP');
  });
});
