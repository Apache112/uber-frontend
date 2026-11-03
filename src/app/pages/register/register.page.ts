import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { RouterModule } from '@angular/router';
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

  registerData = {
    name: '',
    email: '',
    password: '',
    role: 'client',
  };

  errorMessage = '';
  successMessage = '';
  isSubmitting = false;

  onRegister() {
    if (
      !this.registerData.name.trim() ||
      !this.registerData.email.trim() ||
      !this.registerData.password
    ) {
      this.errorMessage = 'Completa todos los campos para crear tu cuenta.';
      this.successMessage = '';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSubmitting = true;

    this.authService.register(this.registerData).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.successMessage =
          res.message || 'Cuenta creada. Ya puedes iniciar sesión.';
      },
      error: (err) => {
        this.isSubmitting = false;
        const validationErrors = err.error?.errors;
        this.errorMessage = validationErrors
          ? Object.values(validationErrors).flat().join(' ')
          : err.error?.message || 'No se pudo crear la cuenta. Inténtalo de nuevo.';
      },
    });
  }
}
