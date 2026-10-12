import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Candle } from '../models/candle.model';

@Injectable({ providedIn: 'root' })
export class CandleStreamService implements OnDestroy {
  private readonly candleSubject = new Subject<Candle>();
  private eventSource: EventSource | null = null;

  constructor(private readonly zone: NgZone) {}

  get candles$(): Observable<Candle> {
    return this.candleSubject.asObservable();
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
    const url = 'http://localhost:8080/api/v1/market-data/stream';
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('candle', (event: MessageEvent) => {
      try {
        const candle = JSON.parse(event.data) as Candle;
        this.zone.run(() => this.candleSubject.next(candle));
      } catch (err) {
        console.error('Failed to parse candle payload', err, event.data);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('Candle SSE connection lost, auto-reconnecting...');
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
    this.candleSubject.complete();
  }
}
