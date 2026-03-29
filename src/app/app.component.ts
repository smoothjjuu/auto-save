import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap, catchError, of, tap, finalize, Subject, takeUntil } from 'rxjs';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private fb = inject(FormBuilder);
  public auth = inject(AuthService);
  public storage = inject(StorageService);

  // Form State
  // --- INITIAL STATE ---
  form: FormGroup;
  // tracking our local version of the document to detect conflicts
  currentVersion = 1;

  // --- UI STATUS SIGNALS ---
  // Using Signals for reactive UI state updates
  saveStatus = signal<'IDLE' | 'SAVING' | 'SAVED' | 'CONFLICT' | 'OFFLINE' | 'ERROR'>('IDLE');
  lastSavedAt = signal<Date | null>(null);
  errorMessage = signal<string | null>(null);

  private destroy$ = new Subject<void>();

  constructor() {
    this.form = this.fb.group({
      title: ['', [Validators.required]],
      content: ['', [Validators.required]]
    });

    // --- CONCURRENCY WATCHER ---
    // EFFECT: This reactive watcher monitors the server version.
    // If the server version increases (e.g., from another tab or user), 
    // and we haven't saved yet, we alert the user of a potential conflict.
    effect(() => {
      const serverV = this.storage.currentServerVersion();
      if (serverV > this.currentVersion && this.saveStatus() !== 'SAVING') {
        this.saveStatus.set('CONFLICT');
      }
    });
  }

  ngOnInit() {
    // Initial data load
    this.loadData();

    // --- AUTO-SAVE ENGINE ---
    // Listen to every keystroke/change in the form
    this.form.valueChanges.pipe(
      // 1. DEBOUNCE: Wait 1 second after the last keystroke before triggering a save.
      // This prevents hammering the API on every single letter typed.
      debounceTime(1000),

      // 2. DISTINCT: Only trigger if the actual content changed. 
      // Prevents redundant saves if the user clicks in/out without typing.
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),

      // 3. AUTH CHECK: Before we even hit the network, ensure we are logged in.
      tap(() => {
        if (!this.auth.isAuthenticated()) {
           this.saveStatus.set('ERROR');
           this.errorMessage.set('You must be logged in to save.');
        } else {
           this.saveStatus.set('SAVING');
           this.errorMessage.set(null);
        }
      }),

      // 4. SWITCHMAP: The "Magic" operator for auto-save.
      // If a NEW change comes in while an OLD save is still in flight, 
      // switchMap cancels the old request and starts the new one.
      switchMap((value) => {
        if (!this.auth.isAuthenticated()) return of(null);
        
        // Pass our 'currentVersion' so the server can check for conflicts (Optimistic Locking)
        return this.storage.saveData(value, this.currentVersion).pipe(
          tap((result: any) => {
            // SUCCESS: Server gives us back the NEW version number
            this.currentVersion = result.version;
            this.saveStatus.set('SAVED');
            this.lastSavedAt.set(new Date());
          }),
          catchError((err) => {
            // CONFLICT HANDLING: Server returned 409 because versions didn't match
            if (err.message === '409 Conflict') {
              this.saveStatus.set('CONFLICT');
            } else if (err.message === 'Network Error') {
              // OFFLINE HANDLING: Simulation of network failure
              this.saveStatus.set('OFFLINE');
              this.errorMessage.set('You are currently offline. Changes are pending.');
            } else {
              this.saveStatus.set('ERROR');
              this.errorMessage.set('An unexpected error occurred.');
            }
            return of(null); // Return empty observable so the stream doesn't die
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  loadData() {
    this.storage.getServerData().subscribe(res => {
      this.form.patchValue(res.data, { emitEvent: false });
      this.currentVersion = res.version;
    });
  }

  login() {
    this.auth.login().subscribe();
  }

  logout() {
    this.auth.logout();
    this.saveStatus.set('IDLE');
  }

  simulateConflict() {
    this.storage.simulateRemoteChange();
  }

  toggleOffline() {
    this.storage.toggleOffline();
    if (!this.storage.isSimulatedOffline() && this.saveStatus() === 'OFFLINE') {
      // If we were offline and now online, hide the offline banner
      this.saveStatus.set('IDLE');
    }
  }

  retrySync() {
    if (this.storage.isSimulatedOffline()) {
      this.errorMessage.set('Still offline! Reconnect first.');
      return;
    }
    this.saveStatus.set('SAVING');
    this.storage.saveData(this.form.value, this.currentVersion).subscribe({
      next: (res: any) => {
        this.currentVersion = res.version;
        this.saveStatus.set('SAVED');
        this.lastSavedAt.set(new Date());
      },
      error: (err) => {
        if (err.message === '409 Conflict') {
          this.saveStatus.set('CONFLICT');
        } else {
          this.saveStatus.set('OFFLINE');
        }
      }
    });
  }

  // --- CONFLICT RESOLUTION ---
  // When a version mismatch (409) happens, the user has two choices:
  resolveConflict(action: 'RELOAD' | 'OVERWRITE') {
    if (action === 'RELOAD') {
      // 1. RELOAD: Discard local changes and pull the latest from the server.
      this.loadData();
      this.saveStatus.set('IDLE');
    } else {
      // 2. OVERWRITE: Force our changes onto the server. 
      // We do this by updating our local 'currentVersion' to match the server's,
      // making the next API call appear "up to date" to the backend.
      this.currentVersion = this.storage.currentServerVersion();
      this.saveStatus.set('SAVING');
      this.storage.saveData(this.form.value, this.currentVersion).subscribe({
        next: (res: any) => {
          this.currentVersion = res.version;
          this.saveStatus.set('SAVED');
          this.lastSavedAt.set(new Date());
        },
        error: () => this.saveStatus.set('ERROR')
      });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
