import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError, delay, tap, map, fromEvent, catchError } from 'rxjs';

import { environment } from '../environments/environment';

export interface FormData {
  title: string;
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private http = inject(HttpClient);
  private readonly API_URL = environment.apiUrl;

  // Current "server" state (cached locally for the UI)
  // serverVersion tracks what we THINK the server version is.
  private serverData: FormData = { title: '', content: '' };
  private serverVersion = 1;

  // Signal to track the current server version. 
  // This is used by the UI components to reactively detect background changes.
  currentServerVersion = signal(1);

  // Simulation: Toggle for Internet Connectivity to demo error handling.
  isSimulatedOffline = signal(false);

  constructor() {
    // Note: We don't need the 'storage' event listener for global sync
    // because the real backend is now the source of truth.
    // However, we'll keep it for the "Same-Computer Multi-Tab" demo.
    fromEvent<StorageEvent>(window, 'storage').subscribe((event) => {
      if (event.key === 'auto-save-sync-trigger') {
         this.loadFromServer().subscribe();
      }
    });
  }

  toggleOffline() {
    this.isSimulatedOffline.update(v => !v);
    console.warn(`[StorageService] NETWORK STATUS: ${this.isSimulatedOffline() ? 'OFFLINE' : 'ONLINE'}`);
  }

  loadFromServer(): Observable<{ data: FormData, version: number }> {
    return this.http.get<any>(this.API_URL).pipe(
      tap(res => {
        this.serverData = { title: res.title, content: res.content };
        this.serverVersion = res.version;
        this.currentServerVersion.set(this.serverVersion);
      }),
      map(res => ({ data: this.serverData, version: this.serverVersion }))
    );
  }

  saveData(data: FormData, clientVersion: number): Observable<{ version: number }> {
    console.log(`[StorageService] Attempting save to .NET API. Client Version: ${clientVersion}`);
    
    // --- OFFLINE SIMULATION ---
    // If the simulation toggle is 'on', we return an observable that fails 
    // after a short delay, mimicking a real network timeout/failure.
    if (this.isSimulatedOffline()) {
      return of(null).pipe(
        delay(800),
        tap(() => { throw new Error('Network Error'); })
      ) as any;
    }

    // --- REAL API CALL ---
    // We send NOT JUST the data, but also the version we think we are editing.
    // This is the core of Optimistic Locking (Concurrency Control).
    const payload = { ...data, version: clientVersion };
    
    return this.http.put<any>(this.API_URL, payload).pipe(
      tap(res => {
        // SUCCESS: The server accepted our change and incremented the version.
        // We update our local cache and signal to keep the UI in sync.
        this.serverData = { ...data };
        this.serverVersion = res.version;
        this.currentServerVersion.set(this.serverVersion);
        
        // CUSTOM EVENT: Notify other tabs on the SAME browser that a save happened.
        localStorage.setItem('auto-save-sync-trigger', Date.now().toString());
      }),
      catchError(err => {
        // CONFLICT: If the server returns 409, it means someone else saved 
        // a newer version while we were still typing.
        if (err.status === 409) {
          return throwError(() => new Error('409 Conflict'));
        }
        return throwError(() => err);
      })
    );
  }

  // Helper for simulation: Manually increment version on server (if the API supported it)
  // For the demo, we'll just simulate it locally or you can use the PUT directly.
  simulateRemoteChange() {
     // In a real app, this would be another user saving.
     // For the demo, we'll just increment our local "belief" of the server version 
     // to trigger a conflict on the next save.
     this.serverVersion++;
     this.currentServerVersion.set(this.serverVersion);
  }

  getServerData(): Observable<{ data: FormData, version: number }> {
    return this.loadFromServer();
  }
}
