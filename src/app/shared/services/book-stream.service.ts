import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BookEvent } from '../models/bot-api.model';
import { BackendConfigService } from './backend-config.service';
import { SseClient } from './sse-client';

@Injectable({ providedIn: 'root' })
export class BookStreamService implements OnDestroy {
  private readonly config = inject(BackendConfigService);
  private readonly client: SseClient<BookEvent>;

  constructor(zone: NgZone) {
    this.client = new SseClient<BookEvent>(zone);
  }

  get events$(): Observable<BookEvent> {
    return this.client.stream$;
  }

  start(): void {
    this.client.start(`${this.config.url}/book/events/stream`, 'book');
  }

  stop(): void {
    this.client.stop();
  }

  ngOnDestroy(): void {
    this.client.complete();
  }
}
