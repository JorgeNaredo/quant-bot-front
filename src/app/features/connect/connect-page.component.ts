import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ConnectResponse } from '../../shared/models/bot-api.model';
import { BackendConfigService } from '../../shared/services/backend-config.service';
import { BotApiService } from '../../shared/services/bot-api.service';
import { SessionStoreService } from '../../shared/services/session-store.service';
import { catchError, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-connect-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './connect-page.component.html',
  styleUrl: './connect-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectPageComponent implements OnInit {
  private readonly config = inject(BackendConfigService);
  private readonly api = inject(BotApiService);
  private readonly store = inject(SessionStoreService);
  private readonly router = inject(Router);

  protected url = this.config.url || 'http://localhost:8080';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.store.connect()) {
      void this.router.navigateByUrl(
        this.store.connect()!.profile === 'backtest' ? '/backtest' : '/desk',
      );
      return;
    }
    // Reload: URL ya en localStorage → rejoin sin volver a pegar el host.
    if (this.config.url) {
      this.url = this.config.url;
      this.connect();
    }
  }

  protected connect(): void {
    this.error.set(null);
    this.busy.set(true);
    try {
      this.config.setUrl(this.url);
    } catch (e) {
      this.busy.set(false);
      this.error.set(e instanceof Error ? e.message : String(e));
      return;
    }
    this.api
      .connect()
      .pipe(
        switchMap((response) => {
          this.store.set(response);
          if (response.profile !== 'backtest') {
            return of({ response, desk: true });
          }
          // Discriminador fuera de connect: solo playback.running → desk.
          return this.api.playbackStatus().pipe(
            catchError(() => of({ running: false })),
            switchMap((status) =>
              of({ response, desk: !!status.running }),
            ),
          );
        }),
      )
      .subscribe({
        next: ({ response, desk }) => {
          this.busy.set(false);
          void this.router.navigateByUrl(
            routeAfterConnect(response, desk),
          );
        },
        error: (err) => {
          this.busy.set(false);
          const detail = err?.message || err?.statusText || 'No se pudo conectar';
          this.error.set(
            `${detail}. Comprueba la URL, que el bot esté en marcha y CORS.`,
          );
        },
      });
  }
}

function routeAfterConnect(response: ConnectResponse, playbackRunning: boolean): string {
  if (response.profile === 'backtest') {
    return playbackRunning ? '/desk' : '/backtest';
  }
  return '/desk';
}
