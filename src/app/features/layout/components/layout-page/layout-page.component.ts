import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { SidebarComponent } from '../../../bot/components/sidebar/sidebar.component';
import { ChartViewComponent } from '../../../bot/components/chart-view/chart-view.component';
import { DashboardPanelComponent } from '../../../bot/components/dashboard-panel/dashboard-panel.component';
import { AnalysisStreamService } from '../../../../shared/services/analysis-stream.service';
import { CandleStreamService } from '../../../../shared/services/candle-stream.service';
import { DecisionStreamService } from '../../../../shared/services/decision-stream.service';
import { OrderStreamService } from '../../../../shared/services/order-stream.service';
import { AccountStreamService } from '../../../../shared/services/account-stream.service';
import { CloseStatsStreamService } from '../../../../shared/services/close-stats-stream.service';
import { DashboardService } from '../../../../shared/services/dashboard.service';
import { AccountInfo } from '../../../../shared/models/account-info.model';
import { CloseStats } from '../../../../shared/models/close-stats.model';
import { ExecutionReport } from '../../../../shared/models/execution-report.model';

interface ActivePosition {
  entryPrice: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  sl: number;
  commission: number;
  entrySpread: number;
}

@Component({
  selector: 'app-layout-page',
  standalone: true,
  imports: [SidebarComponent, ChartViewComponent, DashboardPanelComponent],
  templateUrl: './layout-page.component.html',
  styleUrl: './layout-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class LayoutPageComponent implements OnDestroy {
  private readonly candleStream = inject(CandleStreamService);
  private readonly decisionStream = inject(DecisionStreamService);
  private readonly analysisStream = inject(AnalysisStreamService);
  private readonly orderStream = inject(OrderStreamService);
  private readonly accountStream = inject(AccountStreamService);
  private readonly closeStatsStream = inject(CloseStatsStreamService);
  private readonly dashboardService = inject(DashboardService);

  protected readonly connected = signal(false);
  protected readonly accountInfo = signal<AccountInfo | null>(null);
  protected readonly closeStats = signal<CloseStats | null>(null);
  protected readonly profitLocked = signal<number | null>(null);
  protected readonly breakEvenPrice = signal<number | null>(null);

  private accountSub: Subscription | null = null;
  private closeStatsSub: Subscription | null = null;
  private orderSub: Subscription | null = null;
  private activePosition: ActivePosition | null = null;

  ngOnDestroy(): void {
    this.disconnect();
  }

  protected connect(): void {
    this.candleStream.start();
    this.decisionStream.start();
    this.analysisStream.start();
    this.orderStream.start();
    this.accountStream.start();
    this.closeStatsStream.start();
    this.connected.set(true);
    this.loadAccountSnapshot();
    this.listenAccountUpdates();
    this.listenCloseStats();
    this.listenOrders();
  }

  protected disconnect(): void {
    this.candleStream.stop();
    this.decisionStream.stop();
    this.analysisStream.stop();
    this.orderStream.stop();
    this.accountStream.stop();
    this.closeStatsStream.stop();
    this.connected.set(false);
    this.accountSub?.unsubscribe();
    this.accountSub = null;
    this.closeStatsSub?.unsubscribe();
    this.closeStatsSub = null;
    this.orderSub?.unsubscribe();
    this.orderSub = null;
    this.accountInfo.set(null);
    this.closeStats.set(null);
    this.profitLocked.set(null);
    this.breakEvenPrice.set(null);
    this.activePosition = null;
  }

  private recomputeBreakEven(): void {
    const pos = this.activePosition;
    const acc = this.accountInfo();
    if (!pos || !acc) {
      this.profitLocked.set(null);
      this.breakEvenPrice.set(null);
      return;
    }

    const qty = pos.quantity;
    if (!qty || !pos.sl) {
      this.profitLocked.set(null);
      this.breakEvenPrice.set(null);
      return;
    }

    const commission = pos.commission ?? 0;
    const costPerUnit = pos.entryPrice * pos.entrySpread + commission / qty;
    const be = pos.side === 'BUY'
      ? pos.entryPrice + costPerUnit
      : pos.entryPrice - costPerUnit;

    this.breakEvenPrice.set(be);

    const profit = pos.side === 'BUY'
      ? (pos.sl - be) * qty
      : (be - pos.sl) * qty;
    this.profitLocked.set(profit);
  }

  private listenOrders(): void {
    this.orderSub?.unsubscribe();
    this.orderSub = this.orderStream.execution$.subscribe((report: ExecutionReport) => {
      switch (report.type) {
        case 'ORDER_FILLED':
          this.activePosition = {
            entryPrice: this.activePosition?.entryPrice ?? report.price,
            quantity: (this.activePosition?.quantity ?? 0) + report.filledQuantity,
            side: report.side,
            sl: report.stopLoss,
            commission: (this.activePosition?.commission ?? 0) + report.commission,
            entrySpread: this.accountInfo()?.spread ?? 0,
          };
          break;
        case 'STOP_LOSS_UPDATED':
          if (this.activePosition) {
            this.activePosition.sl = report.stopLoss;
          }
          break;
        case 'STOP_LOSS_HIT':
        case 'TAKE_PROFIT_HIT':
        case 'ORDER_CANCELLED':
        case 'LIQUIDATED':
          this.activePosition = null;
          break;
      }
      this.recomputeBreakEven();
    });
  }

  private loadAccountSnapshot(): void {
    this.dashboardService.getAccountInfo().subscribe((info) => {
      this.accountInfo.set(info);
      this.recomputeBreakEven();
    });
  }

  private listenAccountUpdates(): void {
    this.accountSub?.unsubscribe();
    this.accountSub = this.accountStream.account$.subscribe((update) => {
      this.accountInfo.update((prev) => {
        if (!prev) return update;
        return { ...prev, ...update };
      });
      this.recomputeBreakEven();
    });
  }

  private listenCloseStats(): void {
    this.closeStatsSub?.unsubscribe();
    this.closeStatsSub = this.closeStatsStream.stats$.subscribe((stats) => {
      this.closeStats.set(stats);
    });
  }
}
