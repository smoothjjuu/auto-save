import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, of, delay, tap } from 'rxjs';

export interface UserProfile {
  name: string;
  email: string;
  sub: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // 1. BEHAVIOR SUBJECTS: Traditional RxJS way to handle state. 
  // Good for components that prefer Observables (async pipe).
  private readonly _isAuthenticated = new BehaviorSubject<boolean>(false);
  private readonly _userData = new BehaviorSubject<UserProfile | null>(null);

  isAuthenticated$ = this._isAuthenticated.asObservable();
  userData$ = this._userData.asObservable();

  // 2. SIGNALS (Angular 18+): The modern way to handle state. 
  // Signals are perfect for the UI templates as they are more performant 
  // and handle change detection automatically.
  isAuthenticated = signal(false);
  userData = signal<UserProfile | null>(null);

  login() {
    // SIMULATED LOGIN: In a real app, this would redirect to an OIDC Identity Provider (like Auth0, Azure AD).
    // The delay mimics the network redirect/handshake.
    return of(true).pipe(
      delay(800),
      tap(() => {
        const mockUser: UserProfile = {
          name: 'Demo User',
          email: 'user@example.com',
          sub: '12345' // Unique Subject ID from the Identity Provider
        };
        // Update both the Observable and the Signal states
        this._isAuthenticated.next(true);
        this._userData.next(mockUser);
        this.isAuthenticated.set(true);
        this.userData.set(mockUser);
      })
    );
  }

  logout() {
    this._isAuthenticated.next(false);
    this._userData.next(null);
    this.isAuthenticated.set(false);
    this.userData.set(null);
  }

  getToken() {
    return 'eyMock.OIDC.Token.v18';
  }
}
