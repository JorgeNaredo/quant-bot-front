import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountInfo } from '../models/account-info.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/api/v1/account';

  getAccountInfo(): Observable<AccountInfo> {
    return this.http.get<AccountInfo>(this.baseUrl);
  }
}
