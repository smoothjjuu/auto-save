import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  public auth = inject(AuthService);
  private router = inject(Router);

  loginAs(userIndex: number) {
    this.auth.login(userIndex).subscribe(() => {
      this.router.navigate(['/']);
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/']);
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
