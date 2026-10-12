import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { DecisionMade } from '../models/decision-made.model';

@Injectable({ providedIn: 'root' })
export class DecisionStreamService implements OnDestroy {
  private readonly decisionSubject = new Subject<DecisionMade>();
  private eventSource: EventSource | null = null;

  constructor(private readonly zone: NgZone) {}

  get decisions$(): Observable<DecisionMade> {
    return this.decisionSubject.asObservable();
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
    const url = 'http://localhost:8080/api/v1/decisions/stream';
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('decision', (event: MessageEvent) => {
      try {
        const decision = JSON.parse(event.data) as DecisionMade;
        this.zone.run(() => this.decisionSubject.next(decision));
      } catch (err) {
        console.error('Failed to parse decision payload', err, event.data);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('Decision SSE connection lost, auto-reconnecting...');
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
    this.decisionSubject.complete();
  }
}
