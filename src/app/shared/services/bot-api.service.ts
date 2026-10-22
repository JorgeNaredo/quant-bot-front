import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ConnectResponse,
  EvaluationDocument,
  EvaluationMode,
  LifecycleResponse,
  ProfileReport,
  ReportEntry,
  SpecReachabilityResponse,
} from '../models/bot-api.model';
import { BackendConfigService } from './backend-config.service';

@Injectable({ providedIn: 'root' })
export class BotApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(BackendConfigService);

  connect(): Observable<ConnectResponse> {
    return this.http.get<ConnectResponse>(`${this.config.url}/cc/connect`);
  }

  start(mode: EvaluationMode = 'develop'): Observable<LifecycleResponse> {
    return this.http.post<LifecycleResponse>(`${this.config.url}/cc/start`, { mode });
  }

  stop(): Observable<LifecycleResponse> {
    return this.http.post<LifecycleResponse>(`${this.config.url}/cc/stop`, {});
  }

  listReports(): Observable<ReportEntry[]> {
    return this.http.get<ReportEntry[]>(`${this.config.url}/cc/reports`);
  }

  latestReport(): Observable<EvaluationDocument> {
    return this.http.get<EvaluationDocument>(`${this.config.url}/cc/reports/latest`);
  }

  getReport(name: string): Observable<EvaluationDocument> {
    return this.http.get<EvaluationDocument>(
      `${this.config.url}/cc/reports/${encodeURIComponent(name)}`,
    );
  }

  catalogProfile(symbols: string[]): Observable<ProfileReport> {
    return this.http.post<ProfileReport>(
      `${this.config.url}/backtest/analysis/catalog-profile`,
      { symbols },
    );
  }

  specReachability(symbols: string[]): Observable<SpecReachabilityResponse> {
    return this.http.post<SpecReachabilityResponse>(
      `${this.config.url}/backtest/analysis/spec-reachability`,
      { symbols },
    );
  }
}
