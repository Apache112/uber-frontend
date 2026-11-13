import type { Routes } from '@angular/router';

import { guestGuard, roleGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/welcome/welcome.page').then((module) => module.WelcomePage),
  },
  {
    path: 'welcome',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/welcome/welcome.page').then((module) => module.WelcomePage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.page').then((module) => module.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register.page').then((module) => module.RegisterPage),
  },
  {
    path: 'client-dashboard',
    loadComponent: () =>
      import('./pages/client-dashboard/client-dashboard.page').then((module) => module.ClientDashboardPage),
    canActivate: [roleGuard('client')],
  },
  {
    path: 'driver-dashboard',
    loadComponent: () =>
      import('./pages/driver-dashboard/driver-dashboard.page').then((module) => module.DriverDashboardPage),
    canActivate: [roleGuard('driver')],
  },
  {
    path: 'trip-history',
    loadComponent: () => import('./pages/trip-history/trip-history.page').then((module) => module.TripHistoryPage),
    canActivate: [roleGuard('client')],
  },
  {
    path: 'admin-dashboard',
    loadComponent: () =>
      import('./pages/admin-dashboard/admin-dashboard.page').then((module) => module.AdminDashboardPage),
    canActivate: [roleGuard('admin')],
  },
  { path: '**', redirectTo: '' },
];
