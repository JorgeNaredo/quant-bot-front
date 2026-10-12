import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ExecutionReport } from '../models/execution-report.model';

@Injectable({ providedIn: 'root' })
export class OrderStreamService implements OnDestroy {
  private readonly executionSubject = new Subject<ExecutionReport>();
  private eventSource: EventSource | null = null;

  constructor(private readonly zone: NgZone) {}

  get execution$(): Observable<ExecutionReport> {
    return this.executionSubject.asObservable();
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
    const url = 'http://localhost:8080/api/v1/orders/stream';
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('execution', (event: MessageEvent) => {
      try {
        const report = JSON.parse(event.data) as ExecutionReport;
        this.zone.run(() => this.executionSubject.next(report));
      } catch (err) {
        console.error('Failed to parse execution payload', err, event.data);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('Order SSE connection lost, auto-reconnecting...');
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
    this.executionSubject.complete();
  }
}
