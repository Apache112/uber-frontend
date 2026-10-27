import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then( m => m.LoginPage)
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then( m => m.RegisterPage)
  },
  {
    path: 'client-dashboard',
    loadComponent: () => import('./pages/client-dashboard/client-dashboard.page').then( m => m.ClientDashboardPage),
    canActivate: [authGuard]
  },
  {
    path: 'driver-dashboard',
    loadComponent: () => import('./pages/driver-dashboard/driver-dashboard.page').then( m => m.DriverDashboardPage),
    canActivate: [authGuard]
  },
  {
    path: 'trip-history',
    loadComponent: () => import('./pages/trip-history/trip-history.page').then( m => m.TripHistoryPage),
    canActivate: [authGuard]
  }
];
