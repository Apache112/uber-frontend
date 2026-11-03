import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { TripHistoryPage } from './trip-history.page';

describe('TripHistoryPage', () => {
  let component: TripHistoryPage;
  let fixture: ComponentFixture<TripHistoryPage>;

  beforeEach(() => {
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
