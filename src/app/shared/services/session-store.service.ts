import { Injectable, signal } from '@angular/core';
import { ConnectResponse } from '../models/bot-api.model';

@Injectable({ providedIn: 'root' })
export class SessionStoreService {
  readonly connect = signal<ConnectResponse | null>(null);

  set(response: ConnectResponse): void {
    this.connect.set(response);
  }

  clear(): void {
    this.connect.set(null);
  }
}
