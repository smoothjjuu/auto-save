import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { interval, takeUntil, Subject, merge } from 'rxjs';
import { StorageService } from '../../storage.service';
import { AuthService } from '../../auth.service';
import { SignalRService } from '../../signalr.service';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="list-container animate-fade-in">
      <div class="list-header">
        <h1>Your Forms</h1>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div class="connection-status" *ngIf="isOfflineMode()" style="color: #f87171;">
             ⚠️ Server unreachable. Showing offline drafts.
          </div>
          <div class="connection-status" [class.connected]="signalR.connectionStatus() === 'CONNECTED'" *ngIf="!isOfflineMode()">
            {{ signalR.connectionStatus() === 'CONNECTED' ? '🟢 Live' : '🔴 Reconnecting...' }}
          </div>
          <button (click)="createNew()" class="btn btn-primary" [disabled]="!auth.isAuthenticated()">
            + Create New Form
          </button>
        </div>
      </div>

      <div class="documents-grid" *ngIf="documents().length > 0; else emptyState">
        <div *ngFor="let doc of documents()" 
             class="doc-card" 
             [class.has-draft]="doc.hasDraft"
             (click)="openDoc(doc.id)">
          <div class="doc-icon">{{ doc.hasDraft ? '💾' : '📄' }}</div>
          <div class="doc-info">
            <span class="doc-title">
              {{ doc.title }}
              <span *ngIf="doc.hasDraft" class="draft-tag">DRAFT</span>
            </span>
            <div class="doc-meta">
              <span class="doc-id">ID: {{ doc.id | slice:0:8 }}...</span>
              <span *ngIf="doc.isLocked && doc.lockedBy !== auth.userData()?.name" class="lock-badge" [title]="'Locked by ' + doc.lockedBy">
                🔒 Locked by {{ doc.lockedBy }}
              </span>
            </div>
          </div>
          <div class="delete-wrapper" *ngIf="auth.isAuthenticated()">
            <button 
              (click)="deleteDoc($event, doc.id)" 
              class="btn-icon btn-delete" 
              [title]="doc.isLocked ? 'Cannot delete: Document is locked' : 'Delete Form'"
              [disabled]="doc.isLocked && doc.lockedBy !== auth.userData()?.name"
              [class.disabled-opacity]="doc.isLocked && doc.lockedBy !== auth.userData()?.name"
            >
              🗑️
            </button>
          </div>
          <div class="doc-arrow">→</div>
        </div>
      </div>

      <ng-template #emptyState>
        <div class="empty-state">
          <p>No forms found. Create your first one above!</p>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .list-container { padding: 1rem; }
    .list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    h1 { font-size: 1.8rem; margin: 0; color: white; }
    .documents-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
    .doc-card { 
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 1rem;
      padding: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .doc-card:hover { 
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-2px);
      border-color: var(--primary);
    }
    .doc-card.has-draft {
      border-color: #a855f7; /* Purple border */
      background: rgba(168, 85, 247, 0.05);
    }
    .doc-card.has-draft:hover {
      background: rgba(168, 85, 247, 0.1);
    }
    .doc-icon { font-size: 1.5rem; }
    .doc-info { display: flex; flex-direction: column; flex-grow: 1; }
    .doc-title { font-weight: 600; color: white; display: flex; align-items: center; gap: 0.5rem; }
    .draft-tag {
      font-size: 0.5rem;
      background: #a855f7;
      color: white;
      padding: 0.1rem 0.3rem;
      border-radius: 0.2rem;
      font-weight: 800;
    }
    .doc-id { font-size: 0.7rem; color: var(--text-dim); }
    .doc-arrow { color: var(--text-dim); font-size: 1.2rem; }
    .doc-meta { display: flex; align-items: center; gap: 0.8rem; margin-top: 0.2rem; }
    .lock-badge { 
      font-size: 0.65rem; 
      background: rgba(234, 179, 8, 0.2); 
      color: #eab308; 
      padding: 0.1rem 0.4rem; 
      border-radius: 0.3rem; 
      border: 1px solid rgba(234, 179, 8, 0.3);
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }
    .btn-delete { 
      background: transparent; 
      border: none; 
      font-size: 1.2rem; 
      cursor: pointer; 
      opacity: 0.3; 
      transition: opacity 0.2s;
      padding: 0.5rem;
      border-radius: 0.5rem;
      position: relative;
      z-index: 10;
    }
    .disabled-opacity { cursor: not-allowed !important; opacity: 0.1 !important; }
    .delete-wrapper { position: relative; z-index: 10; }
    .btn-delete:hover:not(:disabled) { opacity: 1; background: rgba(239, 68, 68, 0.1); }
    .connection-status { font-size: 0.65rem; color: var(--text-dim); margin-top: 0.5rem; text-align: right; }
    .connection-status.connected { color: var(--success); }
    .empty-state { text-align: center; padding: 4rem; color: var(--text-dim); background: rgba(0,0,0,0.2); border-radius: 1rem; }
  `]
})
export class ListComponent implements OnInit, OnDestroy {
  private storage = inject(StorageService);
  private router = inject(Router);
  public auth = inject(AuthService);
  public signalR = inject(SignalRService);

  documents = signal<any[]>([]);
  isOfflineMode = signal<boolean>(false);
  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.loadList();
    
    // --- REAL-TIME UPDATES VIA SIGNALR ---
    merge(
      this.signalR.documentCreated$,
      this.signalR.documentUpdated$,
      this.signalR.documentDeleted$,
      this.signalR.lockChanged$
    ).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      console.log('[ListComponent] SignalR update received! Refreshing list...');
      this.loadList();
    });
  }

  loadList() {
    this.storage.listDocuments().subscribe({
      next: (docs) => {
        this.isOfflineMode.set(false);
        // Merge with local drafts
        const mappedDocs = docs.map((d: any) => {
          const draft = this.storage.getLocalCache(d.id);
          const hasDraft = !!draft;
          
          return {
            ...d,
            title: hasDraft ? draft.data.title : d.title, 
            hasDraft: hasDraft,
            isLocked: d.isLocked ?? d.IsLocked, 
            lockedBy: d.lockedBy ?? d.LockedBy
          };
        });
        this.documents.set(mappedDocs);
      },
      error: (err) => {
        console.warn('[ListComponent] Server unreachable. Loading offline drafts...', err);
        this.isOfflineMode.set(true);
        const drafts = this.storage.getAllLocalDrafts();
        this.documents.set(drafts);
      }
    });
  }

  createNew() {
    this.storage.createDocument().subscribe(newDoc => {
      this.router.navigate(['/edit', newDoc.id]);
    });
  }

  openDoc(id: string) {
    if (!this.auth.isAuthenticated()) {
      alert('You must be logged in to view and edit forms.');
      return;
    }
    this.router.navigate(['/edit', id]);
  }

  deleteDoc(event: MouseEvent, id: string) {
    console.log(`[ListComponent] Delete clicked for ID: ${id}`);
    event.preventDefault();
    event.stopPropagation(); 
    event.stopImmediatePropagation();
    
    if (confirm('Are you sure you want to delete this form? This cannot be undone.')) {
      console.log(`[ListComponent] Deletion confirmed. Calling API...`);
      this.storage.deleteDocument(id).subscribe({
        next: () => {
          console.log(`[ListComponent] Delete successful.`);
          this.loadList(); 
        },
        error: (err) => {
          console.error('[ListComponent] Delete failed', err);
          let msg = 'Cannot delete: Document is locked by another user.';
          
          if (err.message === 'Network Error' || err.status === 0) {
            msg = 'Cannot delete while offline. Please restore internet first.';
          } else if (err.error?.message) {
            msg = err.error.message;
          }
          
          alert(msg);
          this.loadList(); // Refresh to catch latest status
        }
      });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
