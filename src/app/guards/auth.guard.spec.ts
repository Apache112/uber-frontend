import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { AuthService } from '../services/auth.service';

import { roleGuard } from './auth.guard';

describe('roleGuard', () => {
  let router: Router;
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/client-dashboard' } as RouterStateSnapshot;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: vi.fn().mockReturnValue(true),
            getRole: vi.fn().mockReturnValue('admin'),
            homeFor: vi.fn().mockReturnValue('/admin-dashboard'),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('redirects an authenticated user to their own dashboard when the role does not match', () => {
    const guard = roleGuard('client');
    const result = TestBed.runInInjectionContext(() => guard(route, state));

    expect(result).toBeInstanceOf(UrlTree);
    if (result instanceof UrlTree) {
      expect(router.serializeUrl(result)).toBe('/admin-dashboard');
    }
  });

  it('allows a user whose role matches the requested panel', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.getRole).mockReturnValue('admin');
    const guard = roleGuard('admin');

    expect(TestBed.runInInjectionContext(() => guard(route, state))).toBe(true);
  });
});
