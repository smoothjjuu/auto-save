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

  // --- UPDATED: SAVE SPECIFIC DOCUMENT (With Local Fallback) ---
  saveData(id: string, data: FormData, clientVersion: number): Observable<{ version: number }> {
    // 1. ALWAYS cache locally first as a "Safety Net"
    this.saveToLocalCache(id, data, clientVersion);

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
        // 2. Clear local cache ONLY after successful server sync
        this.clearLocalCache(id);
      }),
      catchError(err => {
        if (err.status === 409) {
          if (err.error && err.error.serverVersion) {
            this.currentServerVersion.set(err.error.serverVersion);
          }
          return throwError(() => new Error('409 Conflict'));
        }
        return throwError(() => err);
      })
    );
  }

  // --- LOCAL CACHE HELPERS ---
  private getCacheKey(id: string): string {
    const user = this.auth.userData()?.name || 'guest';
    return `${user}_draft_${id}`;
  }

  saveToLocalCache(id: string, data: FormData, version: number) {
    const cacheData = { data, version, timestamp: new Date().getTime() };
    localStorage.setItem(this.getCacheKey(id), JSON.stringify(cacheData));
    console.log(`[StorageService] Cached ${id} locally v${version}`);
  }

  getLocalCache(id: string): { data: FormData, version: number, timestamp: number } | null {
    const raw = localStorage.getItem(this.getCacheKey(id));
    return raw ? JSON.parse(raw) : null;
  }

  clearLocalCache(id: string) {
    localStorage.removeItem(this.getCacheKey(id));
    console.log(`[StorageService] Cleared local cache for ${id}`);
  }

  getAllLocalDrafts(): any[] {
    const drafts: any[] = [];
    const currentUser = this.auth.userData()?.name;
    if (!currentUser) return [];

    const prefix = `${currentUser}_draft_`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const draft = JSON.parse(raw);
          drafts.push({
            id: key.replace(prefix, ''),
            title: draft.data.title,
            hasDraft: true,
            isLocked: false,
            lockedBy: null
          });
        }
      }
    }
    return drafts;
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
    if (this.isSimulatedOffline()) {
      return throwError(() => new Error('Network Error'));
    }
    const userName = this.auth.userData()?.name || '';
    return this.http.delete<any>(`${this.API_URL}/documents/${id}?userName=${userName}`).pipe(
      tap(() => this.clearLocalCache(id)) // Clean up local draft if deleted on server
    );
  }

  // Simulation helpers
  simulateRemoteChange() {
     this.currentServerVersion.update(v => v + 1);
  }
}
