import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { CloseStats } from '../models/close-stats.model';

@Injectable({ providedIn: 'root' })
export class CloseStatsStreamService implements OnDestroy {
  private readonly statsSubject = new Subject<CloseStats>();
  private eventSource: EventSource | null = null;

  constructor(private readonly zone: NgZone) {}

  get stats$(): Observable<CloseStats> {
    return this.statsSubject.asObservable();
  }

  start(): void {
    this.stop();
    this.retryConnect();
  }

  private retryConnect(): void {
    fetch('http://localhost:8080/api/v1/account', { method: 'HEAD' })
      .then(() => this.createEventSource())
      .catch(() => setTimeout(() => this.retryConnect(), 2000));
  }

  private createEventSource(): void {
    const url = 'http://localhost:8080/api/v1/orders/stats';
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('close-stats', (event: MessageEvent) => {
      try {
        const stats = JSON.parse(event.data) as CloseStats;
        this.zone.run(() => this.statsSubject.next(stats));
      } catch (err) {
        console.error('Failed to parse close-stats payload', err, event.data);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('Close-stats SSE connection lost, auto-reconnecting...');
    };
  }

  stop(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
    this.statsSubject.complete();
  }
}
