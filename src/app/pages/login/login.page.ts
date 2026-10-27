import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
// Importamos los componentes listos para standalone usando los nombres nativos de Ionic
import { 
  IonContent, 
  IonHeader, 
  IonTitle, 
  IonToolbar, 
  IonItem, 
  IonInput, 
  IonButton, 
  IonList, 
  IonText 
} from '@ionic/angular';
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
    IonText
  ]
})
export class LoginPage {
  private authService = inject(AuthService);
  private router = inject(Router);

  loginData = {
    login: '',
    password: ''
  };

  errorMessage = '';

  onLogin() {
    this.authService.login(this.loginData).subscribe({
      next: (res) => {
        if (res.user.role === 'client') {
          this.router.navigate(['/client-dashboard']);
        } else if (res.user.role === 'driver') {
          this.router.navigate(['/driver-dashboard']);
        }
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Error al iniciar sesión';
      }
    });
  }
}
