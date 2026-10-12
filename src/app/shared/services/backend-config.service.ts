import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'algotrade.backendUrl';

@Injectable({ providedIn: 'root' })
export class BackendConfigService {
  private readonly urlSignal = signal(this.load());

  readonly baseUrl = this.urlSignal.asReadonly();

  get url(): string {
    return this.urlSignal();
  }

  setUrl(raw: string): string {
    const normalized = normalizeBaseUrl(raw);
    localStorage.setItem(STORAGE_KEY, normalized);
    this.urlSignal.set(normalized);
    return normalized;
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.urlSignal.set('');
  }

  private load(): string {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  }
}

export function normalizeBaseUrl(raw: string): string {
  let value = raw.trim();
  if (!value) {
    throw new Error('Introduce una URL o host:puerto');
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  return value.replace(/\/+$/, '');
}
