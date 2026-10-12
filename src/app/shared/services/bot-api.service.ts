import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ConnectResponse,
  EvaluationDocument,
  LifecycleResponse,
} from '../models/bot-api.model';
import { BackendConfigService } from './backend-config.service';

@Injectable({ providedIn: 'root' })
export class BotApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(BackendConfigService);

  connect(): Observable<ConnectResponse> {
    return this.http.get<ConnectResponse>(`${this.config.url}/cc/connect`);
  }

  start(): Observable<LifecycleResponse> {
    return this.http.post<LifecycleResponse>(`${this.config.url}/cc/start`, {});
  }

  stop(): Observable<LifecycleResponse> {
    return this.http.post<LifecycleResponse>(`${this.config.url}/cc/stop`, {});
  }

  latestReport(): Observable<EvaluationDocument> {
    return this.http.get<EvaluationDocument>(`${this.config.url}/cc/reports/latest`);
  }
}
