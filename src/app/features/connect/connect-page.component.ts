import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { BackendConfigService } from '../../shared/services/backend-config.service';
import { BotApiService } from '../../shared/services/bot-api.service';
import { SessionStoreService } from '../../shared/services/session-store.service';

@Component({
  selector: 'app-connect-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './connect-page.component.html',
  styleUrl: './connect-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectPageComponent {
  private readonly config = inject(BackendConfigService);
  private readonly api = inject(BotApiService);
  private readonly store = inject(SessionStoreService);
  private readonly router = inject(Router);

  protected url = this.config.url || 'http://localhost:8080';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

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
    this.api.connect().subscribe({
      next: (response) => {
        this.store.set(response);
        this.busy.set(false);
        if (response.profile === 'backtest') {
          this.router.navigateByUrl('/backtest');
        } else {
          this.router.navigateByUrl('/desk');
        }
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
