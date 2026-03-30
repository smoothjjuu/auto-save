import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError, delay, tap, map, catchError } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

export interface FormData {
  id?: string;
  title: string;
  content: string;
  isLocked?: boolean;
  lockedBy?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private http = inject(HttpClient);
  private auth = inject(AuthService); 
  private readonly API_URL = environment.apiUrl.replace('/document', ''); 

  // Signal to track the current server version of the SELECTED document.
  currentServerVersion = signal(1);

  // Simulation: Toggle for Internet Connectivity to demo error handling.
  isSimulatedOffline = signal(false);

  constructor() {}

  toggleOffline() {
    this.isSimulatedOffline.update(v => !v);
  }

  // --- NEW: LIST ALL DOCUMENTS ---
  listDocuments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.API_URL}/documents`);
  }

  // --- NEW: CREATE DOCUMENT ---
  createDocument(): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/documents`, {});
  }

  // --- UPDATED: LOAD SPECIFIC DOCUMENT (Includes User Context for Locking) ---
  loadDocument(id: string): Observable<{ data: FormData, version: number }> {
    const userName = this.auth.userData()?.name || '';
    return this.http.get<any>(`${this.API_URL}/documents/${id}?userName=${userName}`).pipe(
      tap((res: any) => {
        this.currentServerVersion.set(res.version);
      }),
      map((res: any) => ({ 
        data: { 
          id: res.id, 
          title: res.title, 
          content: res.content,
          isLocked: res.lockedUntil && new Date(res.lockedUntil) > new Date(),
          lockedBy: res.lockedBy
        }, 
        version: res.version 
      }))
    );
  }

  // --- UPDATED: SAVE SPECIFIC DOCUMENT ---
  saveData(id: string, data: FormData, clientVersion: number): Observable<{ version: number }> {
    if (this.isSimulatedOffline()) {
      return of(null).pipe(
        delay(800),
        tap(() => { throw new Error('Network Error'); })
      ) as any;
    }

    const userName = this.auth.userData()?.name || '';
    const payload = { ...data, version: clientVersion };
    
    return this.http.put<any>(`${this.API_URL}/documents/${id}?userName=${userName}`, payload).pipe(
      tap((res: any) => {
        this.currentServerVersion.set(res.version);
      }),
      catchError(err => {
        if (err.status === 409) {
          if (err.error && err.error.serverVersion) {
            this.currentServerVersion.set(err.error.serverVersion);
          }
          return throwError(() => new Error('409 Conflict'));
        }
        if (err.status === 423) {
          return throwError(() => new Error(err.error?.message || 'Locked'));
        }
        return throwError(() => err);
      })
    );
  }

  // --- HEARTBEAT: RENEW LOCK ---
  refreshLock(id: string): Observable<any> {
    const userName = this.auth.userData()?.name || '';
    if (!userName || this.isSimulatedOffline()) return of(null);
    return this.http.post(`${this.API_URL}/documents/${id}/heartbeat?userName=${userName}`, {});
  }

  // --- UNLOCK: INSTANT RELEASE ---
  unlockDocument(id: string): Observable<any> {
    const userName = this.auth.userData()?.name || '';
    if (!userName) return of(null);
    return this.http.post(`${this.API_URL}/documents/${id}/unlock?userName=${userName}`, {});
  }

  // --- DELETE DOCUMENT ---
  deleteDocument(id: string): Observable<any> {
    const userName = this.auth.userData()?.name || '';
    return this.http.delete<any>(`${this.API_URL}/documents/${id}?userName=${userName}`);
  }

  // Simulation helpers
  simulateRemoteChange() {
     this.currentServerVersion.update(v => v + 1);
  }
}
