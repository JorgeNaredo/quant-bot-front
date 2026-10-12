import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SidebarComponent } from '../../../bot/components/sidebar/sidebar.component';
import { ChartViewComponent } from '../../../bot/components/chart-view/chart-view.component';
import { DashboardPanelComponent } from '../../../bot/components/dashboard-panel/dashboard-panel.component';
import { AccountInfo } from '../../../../shared/models/account-info.model';
import { SessionTick } from '../../../../shared/models/bot-api.model';
import { BotApiService } from '../../../../shared/services/bot-api.service';
import { CandleStreamService } from '../../../../shared/services/candle-stream.service';
import { BookStreamService } from '../../../../shared/services/book-stream.service';
import { SessionStreamService } from '../../../../shared/services/session-stream.service';
import { SpecsStreamService } from '../../../../shared/services/specs-stream.service';
import { SessionStoreService } from '../../../../shared/services/session-store.service';

@Component({
  selector: 'app-layout-page',
  standalone: true,
  imports: [SidebarComponent, ChartViewComponent, DashboardPanelComponent],
  templateUrl: './layout-page.component.html',
  styleUrl: './layout-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutPageComponent implements OnInit, OnDestroy {
  private readonly candleStream = inject(CandleStreamService);
  private readonly bookStream = inject(BookStreamService);
  private readonly sessionStream = inject(SessionStreamService);
  private readonly specsStream = inject(SpecsStreamService);
  private readonly api = inject(BotApiService);
  private readonly store = inject(SessionStoreService);
  private readonly router = inject(Router);

  protected readonly streamsOpen = signal(false);
  protected readonly operating = signal(false);
  protected readonly accountInfo = signal<AccountInfo | null>(null);
  protected readonly profitLocked = signal<number | null>(null);
  protected readonly breakEvenPrice = signal<number | null>(null);
  protected readonly profile = signal(this.store.connect()?.profile ?? 'paper');
  protected readonly symbol = signal(this.store.connect()?.symbol ?? '');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private sessionSub: Subscription | null = null;

  ngOnInit(): void {
    if (!this.store.connect()) {
      void this.router.navigateByUrl('/');
      return;
    }
    this.openStreams();
  }

  ngOnDestroy(): void {
    this.closeStreams();
  }

  protected startBot(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.start().subscribe({
      next: (res) => {
        this.busy.set(false);
        if (!res.ok) {
          this.error.set(res.error || 'No se pudo arrancar');
          return;
        }
        this.operating.set(res.state === 'OPERATING');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error en start');
      },
    });
  }

  protected stopBot(): void {
    this.busy.set(true);
    this.api.stop().subscribe({
      next: (res) => {
        this.busy.set(false);
        this.operating.set(res.state === 'OPERATING');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error en stop');
      },
    });
  }

  protected changeBackend(): void {
    this.closeStreams();
    this.store.clear();
    void this.router.navigateByUrl('/');
  }

  private openStreams(): void {
    this.candleStream.start();
    this.bookStream.start();
    this.sessionStream.start();
    this.specsStream.start();
    this.streamsOpen.set(true);
    this.sessionSub = this.sessionStream.session$.subscribe((tick) => this.applySession(tick));
  }

  private closeStreams(): void {
    this.candleStream.stop();
    this.bookStream.stop();
    this.sessionStream.stop();
    this.specsStream.stop();
    this.sessionSub?.unsubscribe();
    this.sessionSub = null;
    this.streamsOpen.set(false);
  }

  private applySession(tick: SessionTick): void {
    this.operating.set(tick.state === 'OPERATING');
    this.profile.set(tick.profile);
    this.symbol.set(tick.symbol);
    if (tick.account) {
      this.accountInfo.set({
        balance: Number(tick.account.balance),
        equity: Number(tick.account.equity),
        unrealizedPL: Number(tick.account.unrealizedPl),
        spread: 0,
        commission: Number(tick.account.commission),
        currency: tick.account.currency,
        collateral: Number(tick.account.collateral),
      });
    }
    if (tick.position) {
      const pos = tick.position;
      const be = pos.side === 'LONG' ? pos.entryPrice : pos.entryPrice;
      this.breakEvenPrice.set(be);
      this.profitLocked.set(
        pos.side === 'LONG'
          ? (pos.stopPrice - be) * pos.size
          : (be - pos.stopPrice) * pos.size,
      );
    } else {
      this.breakEvenPrice.set(null);
      this.profitLocked.set(null);
    }
  }
}
