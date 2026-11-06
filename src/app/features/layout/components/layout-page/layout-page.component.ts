import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SidebarComponent } from '../../../bot/components/sidebar/sidebar.component';
import { ChartViewComponent } from '../../../bot/components/chart-view/chart-view.component';
import { DashboardPanelComponent } from '../../../bot/components/dashboard-panel/dashboard-panel.component';
import { AccountInfo } from '../../../../shared/models/account-info.model';
import { SessionTick, SpecState } from '../../../../shared/models/bot-api.model';
import { StrategyAccountRow } from '../../../../shared/models/strategy-account.model';
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
  protected readonly openPositionCount = signal(0);
  protected readonly profile = signal(this.store.connect()?.profile ?? 'paper');
  protected readonly symbol = signal(this.store.connect()?.symbol ?? '');
  protected readonly selectorMode = signal(this.store.connect()?.selectorMode ?? 'single-slot');
  protected readonly strategyAccounts = signal<StrategyAccountRow[]>([]);
  protected readonly playbackPaused = signal(false);
  protected readonly playbackSpeed = signal(1);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private sessionSub: Subscription | null = null;
  private specsSub: Subscription | null = null;

  protected get isBacktest(): boolean {
    return this.profile() === 'backtest';
  }

  protected get independent(): boolean {
    return this.selectorMode() === 'independent';
  }

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
    if (this.isBacktest) {
      void this.router.navigateByUrl('/backtest');
      return;
    }
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
    this.error.set(null);
    const req = this.isBacktest ? this.api.stopPlayback() : this.api.stop();
    req.subscribe({
      next: (res) => {
        this.busy.set(false);
        if (!res.ok) {
          this.error.set(res.error || 'No se pudo detener');
          return;
        }
        this.operating.set(res.state === 'OPERATING');
        this.playbackPaused.set(false);
        if (this.isBacktest) {
          void this.router.navigateByUrl('/backtest');
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error en stop');
      },
    });
  }

  protected pausePlayback(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.pausePlayback().subscribe({
      next: (res) => {
        this.busy.set(false);
        if (!res.ok) {
          this.error.set(res.error || 'No se pudo pausar');
          return;
        }
        this.playbackPaused.set(res.paused ?? true);
        if (res.speed != null) this.playbackSpeed.set(res.speed);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error al pausar');
      },
    });
  }

  protected resumePlayback(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.resumePlayback().subscribe({
      next: (res) => {
        this.busy.set(false);
        if (!res.ok) {
          this.error.set(res.error || 'No se pudo reanudar');
          return;
        }
        this.playbackPaused.set(res.paused ?? false);
        if (res.speed != null) this.playbackSpeed.set(res.speed);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error al reanudar');
      },
    });
  }

  protected setPlaybackSpeed(speed: number): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.setPlaybackSpeed({ speed }).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (!res.ok) {
          this.error.set(res.error || 'No se pudo cambiar la velocidad');
          return;
        }
        if (res.speed != null) this.playbackSpeed.set(res.speed);
        if (res.paused != null) this.playbackPaused.set(res.paused);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error al cambiar velocidad');
      },
    });
  }

  private openStreams(): void {
    this.candleStream.start();
    this.bookStream.start();
    this.sessionStream.start();
    this.specsStream.start();
    this.streamsOpen.set(true);
    this.sessionSub = this.sessionStream.session$.subscribe((tick) => this.applySession(tick));
    this.specsSub = this.specsStream.specs$.subscribe((tick) => this.applySpecs(tick.specs));
  }

  private closeStreams(): void {
    this.candleStream.stop();
    this.bookStream.stop();
    this.sessionStream.stop();
    this.specsStream.stop();
    this.sessionSub?.unsubscribe();
    this.sessionSub = null;
    this.specsSub?.unsubscribe();
    this.specsSub = null;
    this.streamsOpen.set(false);
  }

  private applySession(tick: SessionTick): void {
    this.operating.set(tick.state === 'OPERATING');
    this.profile.set(tick.profile);
    this.symbol.set(tick.symbol);
    this.selectorMode.set(tick.selectorMode);
    if (tick.playback) {
      this.playbackPaused.set(!!tick.playback.paused);
      this.playbackSpeed.set(tick.playback.speed || 1);
    } else if (tick.profile === 'backtest' && tick.state !== 'OPERATING') {
      this.playbackPaused.set(false);
    }
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
    if (tick.selectorMode !== 'independent') {
      if (tick.position) {
        const pos = tick.position;
        const be = pos.entryPrice;
        this.breakEvenPrice.set(be);
        this.openPositionCount.set(1);
        this.profitLocked.set(
          pos.side === 'LONG'
            ? (pos.stopPrice - be) * pos.size
            : (be - pos.stopPrice) * pos.size,
        );
      } else {
        this.breakEvenPrice.set(null);
        this.profitLocked.set(null);
        this.openPositionCount.set(0);
      }
    }
  }

  private applySpecs(specs: SpecState[]): void {
    if (this.selectorMode() !== 'independent') {
      this.strategyAccounts.set([]);
      return;
    }
    const rows: StrategyAccountRow[] = specs.map((spec) => {
      const acc = spec.account;
      const account: AccountInfo = {
        balance: Number(acc?.balance ?? 0),
        equity: Number(acc?.equity ?? 0),
        unrealizedPL: Number(acc?.unrealizedPl ?? 0),
        spread: 0,
        commission: Number(acc?.commission ?? 0),
        currency: acc?.currency ?? 'USDT',
        collateral: Number(acc?.collateral ?? 0),
      };
      const position = spec.position ?? null;
      let profitLocked: number | null = null;
      if (position) {
        const be = position.entryPrice;
        profitLocked =
          position.side === 'LONG'
            ? (position.stopPrice - be) * position.size
            : (be - position.stopPrice) * position.size;
      }
      return {
        id: spec.id,
        shortId: shortStrategyId(spec.id),
        account,
        position,
        profitLocked,
      };
    });
    this.strategyAccounts.set(rows);
    const open = rows.filter((r) => r.position);
    this.openPositionCount.set(open.length);
    if (open.length === 1 && open[0].position) {
      this.breakEvenPrice.set(open[0].position.entryPrice);
    } else {
      this.breakEvenPrice.set(null);
    }
    this.profitLocked.set(null);
  }
}

function shortStrategyId(id: string): string {
  if (id.length <= 16) return id;
  const parts = id.split(/[-_./]/).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts.slice(-2).join('-');
    return tail.length <= 16 ? tail : tail.slice(0, 16);
  }
  return id.slice(0, 16);
}
