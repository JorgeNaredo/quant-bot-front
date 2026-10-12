import { NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export class SseClient<T> {
  private readonly subject = new Subject<T>();
  private eventSource: EventSource | null = null;

  constructor(private readonly zone: NgZone) {}

  get stream$(): Observable<T> {
    return this.subject.asObservable();
  }

  start(url: string, eventName: string): void {
    this.stop();
    this.eventSource = new EventSource(url);
    this.eventSource.addEventListener(eventName, (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as T;
        this.zone.run(() => this.subject.next(payload));
      } catch (err) {
        console.error(`Failed to parse SSE ${eventName}`, err, event.data);
      }
    });
    this.eventSource.onerror = () => {
      console.warn(`SSE ${eventName} connection lost`);
    };
  }

  stop(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  complete(): void {
    this.stop();
    this.subject.complete();
  }
}
