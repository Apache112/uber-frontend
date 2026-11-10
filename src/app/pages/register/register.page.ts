import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { apiErrorMessage } from '../../services/api-error';
import type { RegisterPayload } from '../../services/auth.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonSelect,
    IonSelectOption,
    IonText,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    RouterModule,
  ],
})
export class RegisterPage {
  private authService = inject(AuthService);
  private router = inject(Router);

  registerData = {
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'client' as 'client' | 'driver',
    license_number: '',
    plate: '',
    brand: '',
    model: '',
    year: null as number | null,
    capacity: null as number | null,
    color: '',
  };

  errorMessage = '';
  successMessage = '';
  isSubmitting = false;

  onRegister(): void {
    if (
      !this.registerData.name.trim() ||
      !this.registerData.email.trim() ||
      this.registerData.password.length < 6 ||
      (this.registerData.role === 'driver' &&
        (!this.registerData.phone.trim() ||
          !this.registerData.license_number.trim() ||
          !this.registerData.plate.trim() ||
          !this.registerData.brand.trim() ||
          !this.registerData.model.trim() ||
          !this.registerData.year ||
          !this.registerData.capacity ||
          !this.registerData.color.trim()))
    ) {
      this.errorMessage =
        this.registerData.password.length < 6
          ? 'La contraseña debe tener al menos 6 caracteres.'
          : 'Completa todos los campos requeridos para crear tu cuenta.';
      this.successMessage = '';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSubmitting = true;

    this.authService.register(this.registrationPayload()).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (res.user.role !== 'client' && res.user.role !== 'driver') {
          this.successMessage = res.message || 'Cuenta creada. Ya puedes iniciar sesión.';
          return;
        }
        this.navigateForRole(res.user.role);
      },
      error: (err: unknown) => {
        this.isSubmitting = false;
        this.errorMessage = apiErrorMessage(err, 'No se pudo crear la cuenta. Inténtalo de nuevo.');
      },
    });
  }

  onRegisterLocal(): void {
    if (
      !this.registerData.name.trim() ||
      !this.registerData.email.trim() ||
      this.registerData.password.length < 6 ||
      (this.registerData.role === 'driver' &&
        (!this.registerData.phone.trim() ||
          !this.registerData.license_number.trim() ||
          !this.registerData.plate.trim() ||
          !this.registerData.brand.trim() ||
          !this.registerData.model.trim() ||
          !this.registerData.year ||
          !this.registerData.capacity ||
          !this.registerData.color.trim()))
    ) {
      this.errorMessage =
        this.registerData.password.length < 6
          ? 'La contraseña debe tener al menos 6 caracteres.'
          : 'Completa todos los campos requeridos para crear tu cuenta.';
      this.successMessage = '';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSubmitting = true;
    const userData = this.registrationPayload();

    this.authService.registerLocal(userData).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.navigateForRole(response.user.role);
      },
      error: (error: unknown) => {
        this.isSubmitting = false;
        this.errorMessage = apiErrorMessage(error, 'No se pudo crear la cuenta local.');
      },
    });
  }

  private registrationPayload(): RegisterPayload {
    return this.registerData.role === 'driver'
      ? {
          ...this.registerData,
          year: Number(this.registerData.year),
          capacity: Number(this.registerData.capacity),
        }
      : {
          name: this.registerData.name,
          email: this.registerData.email,
          phone: this.registerData.phone,
          password: this.registerData.password,
          role: this.registerData.role,
        };
  }

  private navigateForRole(role: string): void {
    if (role === 'client') {
      void this.router.navigate(['/client-dashboard']);
    } else if (role === 'driver') {
      void this.router.navigate(['/driver-dashboard']);
    }
  }
}
