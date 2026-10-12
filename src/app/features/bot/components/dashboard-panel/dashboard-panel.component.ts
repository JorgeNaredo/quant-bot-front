import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Subscription, interval, map, startWith } from 'rxjs';
import { MarketBias, MarketDirection, PriceAnalysis, VolatilityState } from '../../../../shared/models/analysis.model';
import { Order } from '../../../../shared/models/order.model';
import { ExecutionReport } from '../../../../shared/models/execution-report.model';
import { AnalysisStreamService } from '../../../../shared/services/analysis-stream.service';
import { OrderStreamService } from '../../../../shared/services/order-stream.service';
import { DecisionStreamService } from '../../../../shared/services/decision-stream.service';
import { DecisionMade } from '../../../../shared/models/decision-made.model';

@Component({
  selector: 'app-dashboard-panel',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './dashboard-panel.component.html',
  styleUrl: './dashboard-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPanelComponent implements OnDestroy {
  readonly connected = input(false);

  private readonly analysisStream = inject(AnalysisStreamService);
  private readonly orderStream = inject(OrderStreamService);
  private readonly decisionStream = inject(DecisionStreamService);

  protected readonly analysis = signal<PriceAnalysis | null>(null);
  protected readonly decisions = signal<DecisionMade[]>([]);
  protected readonly orders = signal<Order[]>([]);
  protected readonly ordersLoading = signal(false);
  protected readonly elapsedSeconds = signal(0);
  protected readonly activeOrders = computed(() =>
    this.orders().filter(o => o.status === 'ORDER_ACCEPTED' || o.status === 'ORDER_FILLED')
  );
  protected readonly closedOrders = computed(() =>
    this.orders().filter(o => o.status === 'ORDER_CANCELLED' || o.status === 'ORDER_EXPIRED' || o.status === 'STOP_LOSS_HIT' || o.status === 'TAKE_PROFIT_HIT' || o.status === 'LIQUIDATED' || o.status === 'POSITION_CLOSED')
  );
  protected readonly activeTab = signal(0);
  protected readonly expandedSections = signal<Set<string>>(new Set(['señal', 'regimen']));

  protected toggleSection(section: string): void {
    this.expandedSections.update(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }

  protected isExpanded(section: string): boolean {
    return this.expandedSections().has(section);
  }

  private readonly orderMap = new Map<string, Order>();

  private analysisSub: Subscription | null = null;
  private orderSub: Subscription | null = null;
  private decisionSub: Subscription | null = null;
  private timerSub: Subscription | null = null;
  private lastUpdateTs = 0;

  constructor() {
    effect(() => {
      if (this.connected()) {
        this.startAnalysisListening();
        this.startDecisionListening();
        this.startOrderListening();
      } else {
        this.clearAll();
      }
    });
  }

  ngOnDestroy(): void {
    this.analysisSub?.unsubscribe();
    this.orderSub?.unsubscribe();
    this.decisionSub?.unsubscribe();
    this.timerSub?.unsubscribe();
  }

  protected actionLabel(action: string): string {
    switch (action) {
      case 'BUY': return 'COMPRA';
      case 'SELL': return 'VENTA';
      case 'CLOSE': return 'CIERRE';
      case 'UPDATE_SL': return 'MOV. SL';
      case 'WAIT': return 'ESPERA';
      default: return action;
    }
  }

  protected actionClass(action: string): string {
    switch (action) {
      case 'BUY': return 'tag--buy';
      case 'SELL': return 'tag--sell';
      case 'CLOSE': return 'tag--close';
      case 'UPDATE_SL': return 'tag--close';
      case 'WAIT': return 'tag--wait';
      default: return '';
    }
  }

  protected tradeActionLabel(action: string): string {
    switch (action) {
      case 'LONG': return 'LARGO';
      case 'SHORT': return 'CORTO';
      case 'HOLD': return 'ESPERA';
      default: return action;
    }
  }

  protected tradeActionClass(action: string): string {
    switch (action) {
      case 'LONG': return 'tag--buy';
      case 'SHORT': return 'tag--sell';
      case 'HOLD': return 'tag--wait';
      default: return '';
    }
  }

  protected convictionLabel(c: string): string {
    switch (c) {
      case 'NONE': return 'NINGUNA';
      case 'LOW': return 'BAJA';
      case 'MEDIUM': return 'MEDIA';
      case 'HIGH': return 'ALTA';
      default: return c;
    }
  }

  protected healthLabel(h: string): string {
    switch (h) {
      case 'HEALTHY': return 'SANO';
      case 'WARNING': return 'ADVERTENCIA';
      case 'EXHAUSTED': return 'AGOTADO';
      default: return h;
    }
  }

  protected biasLabel(b: MarketBias | undefined): string {
    switch (b) {
      case 'STRONG_LONG': return 'FUERTE LARGO';
      case 'LONG': return 'LARGO';
      case 'NEUTRAL_LONG': return 'LIG. LARGO';
      case 'NEUTRAL': return 'NEUTRO';
      case 'NEUTRAL_SHORT': return 'LIG. CORTO';
      case 'SHORT': return 'CORTO';
      case 'STRONG_SHORT': return 'FUERTE CORTO';
      default: return 'N/D';
    }
  }

  protected biasClass(b: MarketBias | undefined): string {
    switch (b) {
      case 'STRONG_LONG':
      case 'LONG': return 'tag--buy';
      case 'NEUTRAL_LONG':
      case 'NEUTRAL':
      case 'NEUTRAL_SHORT': return 'tag--neutral';
      case 'SHORT':
      case 'STRONG_SHORT': return 'tag--sell';
      default: return '';
    }
  }

  protected directionLabel(d: MarketDirection | undefined): string {
    switch (d) {
      case 'BULLISH': return 'ALCISTA';
      case 'BEARISH': return 'BAJISTA';
      case 'NEUTRAL': return 'NEUTRO';
      default: return 'N/D';
    }
  }

  protected directionClass(d: MarketDirection | undefined): string {
    switch (d) {
      case 'BULLISH': return 'tag--buy';
      case 'BEARISH': return 'tag--sell';
      case 'NEUTRAL': return 'tag--neutral';
      default: return '';
    }
  }

  protected volatilityLabel(v: VolatilityState | undefined): string {
    switch (v) {
      case 'CONTRACTING': return 'CONTRACCIÓN';
      case 'NORMAL': return 'NORMAL';
      case 'EXPANDING': return 'EXPANSIÓN';
      default: return 'N/D';
    }
  }

  protected persistenceLabel(p: number | undefined): string {
    if (p === undefined || !isFinite(p)) return 'N/D';
    return `${(p * 100).toFixed(0)}%`;
  }

  protected formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('es-ES', { hour12: false });
  }

  protected setTab(tab: number): void {
    this.activeTab.set(tab);
  }

  private startAnalysisListening(): void {
    this.analysisSub?.unsubscribe();
    this.analysisSub = this.analysisStream.analysis$.subscribe((a) => {
      this.analysis.set(a);
      this.lastUpdateTs = Date.now();
      this.elapsedSeconds.set(0);
    });
    this.startTimer();
  }

  private startTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = interval(1000)
      .pipe(
        startWith(0),
        map(() => this.lastUpdateTs > 0
          ? Math.floor((Date.now() - this.lastUpdateTs) / 1000)
          : 0)
      )
      .subscribe((sec) => this.elapsedSeconds.set(sec));
  }

  private startDecisionListening(): void {
    this.decisionSub?.unsubscribe();
    this.decisionSub = this.decisionStream.decisions$.subscribe((d) => {
      this.decisions.update((prev) => [d, ...prev].slice(0, 100));
    });
  }

  private startOrderListening(): void {
    this.orderSub?.unsubscribe();
    this.orderMap.clear();
    this.ordersLoading.set(true);
    this.orderSub = this.orderStream.execution$.subscribe((report) => {
      this.handleExecutionReport(report);
      this.ordersLoading.set(false);
    });
  }

  private handleExecutionReport(report: ExecutionReport): void {
    switch (report.type) {
      case 'ORDER_ACCEPTED':
      case 'ORDER_FILLED':
        this.orderMap.set(report.orderId, {
          id: report.orderId,
          symbol: report.symbol,
          side: report.side,
          type: 'LIMIT',
          quantity: report.filledQuantity,
          price: report.price,
          status: report.type,
          timestamp: new Date(report.timestamp).toISOString(),
        });
        break;
      case 'ORDER_CANCELLED':
      case 'ORDER_EXPIRED':
      case 'STOP_LOSS_HIT':
      case 'TAKE_PROFIT_HIT':
      case 'LIQUIDATED':
      case 'POSITION_CLOSED': {
        const existing = this.orderMap.get(report.orderId);
        if (existing) {
          this.orderMap.set(report.orderId, { ...existing, status: report.type });
        }
        break;
      }
    }
    this.orders.set(Array.from(this.orderMap.values()));
  }

  private clearAll(): void {
    this.analysis.set(null);
    this.decisions.set([]);
    this.orders.set([]);
    this.ordersLoading.set(false);
    this.elapsedSeconds.set(0);
    this.lastUpdateTs = 0;
    this.analysisSub?.unsubscribe();
    this.analysisSub = null;
    this.orderSub?.unsubscribe();
    this.orderSub = null;
    this.decisionSub?.unsubscribe();
    this.decisionSub = null;
    this.timerSub?.unsubscribe();
    this.timerSub = null;
  }
}
