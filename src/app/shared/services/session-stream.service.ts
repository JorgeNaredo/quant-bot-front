import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SessionTick } from '../models/bot-api.model';
import { BackendConfigService } from './backend-config.service';
import { SseClient } from './sse-client';

@Injectable({ providedIn: 'root' })
export class SessionStreamService implements OnDestroy {
  private readonly config = inject(BackendConfigService);
  private readonly client: SseClient<SessionTick>;

  constructor(zone: NgZone) {
    this.client = new SseClient<SessionTick>(zone);
  }

  get session$(): Observable<SessionTick> {
    return this.client.stream$;
  }

  start(): void {
    this.client.start(`${this.config.url}/cc/session/stream`, 'session');
  }

  stop(): void {
    this.client.stop();
  }

  ngOnDestroy(): void {
    this.client.complete();
  }
}
