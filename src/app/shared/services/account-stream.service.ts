import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AccountInfo } from '../models/account-info.model';

@Injectable({ providedIn: 'root' })
export class AccountStreamService implements OnDestroy {
  private readonly accountSubject = new Subject<AccountInfo>();
  private eventSource: EventSource | null = null;

  constructor(private readonly zone: NgZone) {}

  get account$(): Observable<AccountInfo> {
    return this.accountSubject.asObservable();
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
    const url = 'http://localhost:8080/api/v1/account/stream';
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('account', (event: MessageEvent) => {
      try {
        const info = JSON.parse(event.data) as AccountInfo;
        this.zone.run(() => this.accountSubject.next(info));
      } catch (err) {
        console.error('Failed to parse account payload', err, event.data);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('Account SSE connection lost, auto-reconnecting...');
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
    this.accountSubject.complete();
  }
}
