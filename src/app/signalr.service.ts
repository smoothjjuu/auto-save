import { Injectable, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection!: signalR.HubConnection;
  private readonly HUB_URL = environment.apiUrl.replace('/document', '/documentHub');

  // Events for components to subscribe to
  documentCreated$ = new Subject<string>();
  documentUpdated$ = new Subject<{ id: string, version: number, user: string }>();
  documentDeleted$ = new Subject<string>();
  lockChanged$ = new Subject<{ id: string, isLocked: boolean, user: string | null }>();

  connectionStatus = signal<'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'>('DISCONNECTED');

  constructor() {
    this.startConnection();
  }

  private startConnection() {
    this.connectionStatus.set('CONNECTING');

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.HUB_URL, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => {
        console.log('[SignalR] Connection started');
        this.connectionStatus.set('CONNECTED');
        this.registerHandlers();
      })
      .catch(err => {
        console.error('[SignalR] Error while starting connection: ' + err);
        this.connectionStatus.set('DISCONNECTED');
      });
  }

  private registerHandlers() {
    this.hubConnection.on('DocumentCreated', (id: string) => {
      this.documentCreated$.next(id);
    });

    this.hubConnection.on('DocumentUpdated', (id: string, version: number, user: string) => {
      this.documentUpdated$.next({ id, version, user });
    });

    this.hubConnection.on('DocumentDeleted', (id: string) => {
      this.documentDeleted$.next(id);
    });

    this.hubConnection.on('LockChanged', (id: string, isLocked: boolean, user: string | null) => {
      this.lockChanged$.next({ id, isLocked, user });
    });
  }
}
