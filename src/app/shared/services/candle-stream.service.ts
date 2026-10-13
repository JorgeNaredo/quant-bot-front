import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Candle } from '../models/candle.model';
import { CandleDto } from '../models/bot-api.model';
import { BackendConfigService } from './backend-config.service';
import { SseClient } from './sse-client';

@Injectable({ providedIn: 'root' })
export class CandleStreamService implements OnDestroy {
  private readonly config = inject(BackendConfigService);
  private readonly client: SseClient<CandleDto>;

  constructor(zone: NgZone) {
    this.client = new SseClient<CandleDto>(zone);
  }

  get candles$(): Observable<Candle> {
    return this.client.stream$.pipe(
      map((dto) => ({
        timestamp: dto.openTime,
        open: Number(dto.open),
        high: Number(dto.high),
        low: Number(dto.low),
        close: Number(dto.close),
        volume: Number(dto.volume),
        closed: dto.closed,
      })),
    );
  }

  start(): void {
    this.client.start(`${this.config.url}/market/klines/stream`, 'candle');
  }

  stop(): void {
    this.client.stop();
  }

  ngOnDestroy(): void {
    this.client.complete();
  }
}
