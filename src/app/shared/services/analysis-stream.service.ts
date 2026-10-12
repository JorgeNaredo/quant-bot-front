import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { PriceAnalysis } from '../models/analysis.model';

@Injectable({ providedIn: 'root' })
export class AnalysisStreamService implements OnDestroy {
  private readonly analysisSubject = new Subject<PriceAnalysis>();
  private eventSource: EventSource | null = null;

  constructor(private readonly zone: NgZone) {}

  get analysis$(): Observable<PriceAnalysis> {
    return this.analysisSubject.asObservable();
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
    const url = 'http://localhost:8080/api/v1/analysis/stream';
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('analysis', (event: MessageEvent) => {
      try {
        const analysis = JSON.parse(event.data) as PriceAnalysis;
        this.zone.run(() => this.analysisSubject.next(analysis));
      } catch (err) {
        console.error('Failed to parse analysis payload', err, event.data);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('Analysis SSE connection lost, auto-reconnecting...');
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
    this.analysisSubject.complete();
  }
}
