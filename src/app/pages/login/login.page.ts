import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonItem,
  IonInput,
  IonButton,
  IonList,
  IonText,
} from '@ionic/angular';

import { apiErrorMessage } from '../../services/api-error';
// Importamos los componentes listos para standalone usando los nombres nativos de Ionic
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  // Asegúrate de listar explícitamente cada componente de Ionic aquí
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonItem,
    IonInput,
    IonButton,
    IonList,
    IonText,
  ],
})
export class LoginPage {
  private authService = inject(AuthService);
  private router = inject(Router);

  loginData = {
    login: '',
    password: '',
  };

  errorMessage = '';

  onLogin(): void {
    this.authService.login(this.loginData).subscribe({
      next: (res) => {
        this.navigateForRole(res.user.role);
      },
      error: (err) => {
        this.errorMessage = apiErrorMessage(err, 'Error al iniciar sesión');
      },
    });
  }

  onLocalLogin(): void {
    this.authService.loginLocal(this.loginData).subscribe({
      next: (response) => this.navigateForRole(response.user.role),
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error, 'No se pudo iniciar sesión con una cuenta local.');
      },
    });
  }

  private navigateForRole(role: string): void {
    if (role === 'client') {
      void this.router.navigate(['/client-dashboard']);
    } else if (role === 'driver') {
      void this.router.navigate(['/driver-dashboard']);
    }
  }
}
