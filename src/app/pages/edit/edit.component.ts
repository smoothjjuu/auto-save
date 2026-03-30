import { Component, OnInit, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap, catchError, of, tap, Subject, takeUntil, interval } from 'rxjs';
import { StorageService } from '../../storage.service';
import { AuthService } from '../../auth.service';
import { SignalRService } from '../../signalr.service';

@Component({
  selector: 'app-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css'
})
export class EditComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public storage = inject(StorageService);
  public auth = inject(AuthService);
  public signalR = inject(SignalRService);

  form: FormGroup;
  docId: string | null = null;
  currentVersion = 1;

  saveStatus = signal<'IDLE' | 'SAVING' | 'SAVED' | 'CONFLICT' | 'OFFLINE' | 'ERROR'>('IDLE');
  lastSavedAt = signal<Date | null>(null);
  errorMessage = signal<string | null>(null);

  private destroy$ = new Subject<void>();

  constructor() {
    this.form = this.fb.group({
      id: [''],
      title: ['', [Validators.required]],
      content: ['', [Validators.required]]
    });

    effect(() => {
      const serverV = this.storage.currentServerVersion();
      if (serverV > this.currentVersion && this.saveStatus() !== 'SAVING') {
        this.saveStatus.set('CONFLICT');
      }
    });
  }

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
       this.docId = params['id'];
       if (this.docId) {
         this.loadData(this.docId);
       }
    });

    // --- SIGNALR: INSTANT CONFLICT DETECTION ---
    this.signalR.documentUpdated$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(update => {
      if (update.id === this.docId && update.user !== this.auth.userData()?.name) {
        if (update.version > this.currentVersion) {
           console.log(`[EditComponent] External update detected! v${update.version} > v${this.currentVersion}`);
           this.saveStatus.set('CONFLICT');
        }
      }
    });

    if (!this.auth.isAuthenticated()) {
       this.saveStatus.set('ERROR');
       this.errorMessage.set('You are viewing in read-only mode. Please login to edit.');
    } else {
       // --- HEARTBEAT: RENEW LOCK EVERY 30 SECONDS ---
       interval(30000).pipe(
         switchMap(() => {
           if (!this.docId) return of(null);
           return this.storage.refreshLock(this.docId).pipe(
             catchError(err => {
               if (err.status === 423) {
                 this.saveStatus.set('CONFLICT');
                 this.errorMessage.set('Lock lost! ' + (err.error?.message || 'Another user has claimed this document.'));
               }
               return of(null);
             })
           );
         }),
         takeUntil(this.destroy$)
       ).subscribe();
    }

    this.form.valueChanges.pipe(
      debounceTime(1000),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      tap(() => {
        if (!this.auth.isAuthenticated()) {
           this.saveStatus.set('ERROR');
           this.errorMessage.set('You must be logged in to save.');
        } else {
           this.saveStatus.set('SAVING');
           this.errorMessage.set(null);
        }
      }),
      switchMap((value) => {
        if (!this.auth.isAuthenticated() || !this.docId) return of(null);
        return this.storage.saveData(this.docId, value, this.currentVersion).pipe(
          tap((result: any) => {
            this.currentVersion = result.version;
            this.saveStatus.set('SAVED');
            this.lastSavedAt.set(new Date());
          }),
          catchError((err) => {
            console.error('[EditComponent] Save error:', err);
            if (err.status === 423) {
              const serverMsg = err.error?.message || 'locked by another user';
              const fullMsg = `Failed to save: ${serverMsg}`;
              this.saveStatus.set('ERROR');
              this.errorMessage.set(fullMsg);
              alert(fullMsg);
            } else if (err.status === 404) {
              this.saveStatus.set('ERROR');
              this.errorMessage.set('The document was deleted by another user.');
              alert('The document was deleted by another user.');
              setTimeout(() => this.router.navigate(['/']), 3000);
            } else if (err.message === '409 Conflict') {
              this.saveStatus.set('CONFLICT');
            } else if (err.message === 'Network Error') {
              this.saveStatus.set('OFFLINE');
            } else {
              this.saveStatus.set('ERROR');
              this.errorMessage.set(err.error?.message || err.message || 'Failed to save.');
            }
            return of(null);
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  loadData(id: string) {
    this.storage.loadDocument(id).subscribe({
      next: (res) => {
        this.form.patchValue(res.data, { emitEvent: false });
        this.currentVersion = res.version;

        if (res.data.isLocked && res.data.lockedBy !== this.auth.userData()?.name) {
          this.saveStatus.set('ERROR');
          this.errorMessage.set(`Warning: This document is currently being edited by ${res.data.lockedBy}. Your changes will be blocked.`);
        }
      },
      error: (err) => {
        if (err.status === 404) {
          alert('This document no longer exists.');
        }
        this.router.navigate(['/']);
      }
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  simulateConflict() {
    this.storage.simulateRemoteChange();
  }

  toggleOffline() {
    this.storage.toggleOffline();
  }

  retrySync() {
    if (this.storage.isSimulatedOffline() || !this.docId) return;
    this.saveStatus.set('SAVING');
    this.storage.saveData(this.docId, this.form.value, this.currentVersion).subscribe({
      next: (res: any) => {
        this.currentVersion = res.version;
        this.saveStatus.set('SAVED');
        this.lastSavedAt.set(new Date());
      },
      error: () => this.saveStatus.set('ERROR')
    });
  }

  resolveConflict(action: 'RELOAD' | 'OVERWRITE') {
    if (!this.docId) return;
    if (action === 'RELOAD') {
      this.loadData(this.docId);
      this.saveStatus.set('IDLE');
    } else {
      this.currentVersion = this.storage.currentServerVersion();
      this.saveStatus.set('SAVING');
      this.storage.saveData(this.docId, this.form.value, this.currentVersion).subscribe({
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
    if (this.docId && this.auth.isAuthenticated()) {
      this.storage.unlockDocument(this.docId).subscribe();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
}
