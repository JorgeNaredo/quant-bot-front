import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SpecsTick } from '../models/bot-api.model';
import { BackendConfigService } from './backend-config.service';
import { SseClient } from './sse-client';

@Injectable({ providedIn: 'root' })
export class SpecsStreamService implements OnDestroy {
  private readonly config = inject(BackendConfigService);
  private readonly client: SseClient<SpecsTick>;

  constructor(zone: NgZone) {
    this.client = new SseClient<SpecsTick>(zone);
  }

  get specs$(): Observable<SpecsTick> {
    return this.client.stream$;
  }

  start(): void {
    this.client.start(`${this.config.url}/strategies/stream`, 'specs');
  }

  stop(): void {
    this.client.stop();
  }

  ngOnDestroy(): void {
    this.client.complete();
  }
}
