import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  EvaluationDocument,
  ReportEntry,
  SpecReachabilityOutcome,
  StrategyReport,
  SymbolOutcome,
  TradeRow,
} from '../../shared/models/bot-api.model';
import { BotApiService } from '../../shared/services/bot-api.service';
import { SessionStoreService } from '../../shared/services/session-store.service';
import {
  MonthlyBar,
  SplitKey,
  buildComparisonRows,
  buildMonthlyBars,
  collectTrades,
  evaluationModeOf,
  filterByStrategy,
  formatRunHeader,
  strategyOptions,
} from './report-data';
import { ReportExportComponent } from './report-export/report-export.component';
import { ResultComparisonTableComponent } from './components/result-comparison-table/result-comparison-table.component';
import { StrategyDetailsComponent } from './components/strategy-details/strategy-details.component';
import { StrategySummaryTableComponent } from './components/strategy-summary-table/strategy-summary-table.component';

@Component({
  selector: 'app-backtest-page',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    ReportExportComponent,
    AccordionModule,
    ButtonModule,
    MessageModule,
    TableModule,
    TagModule,
    StrategySummaryTableComponent,
    StrategyDetailsComponent,
    ResultComparisonTableComponent,
  ],
  templateUrl: './backtest-page.component.html',
  styleUrl: './backtest-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BacktestPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('monthChart', { static: false })
  private monthChartEl?: ElementRef<HTMLDivElement>;

  private readonly api = inject(BotApiService);
  private readonly store = inject(SessionStoreService);
  private readonly router = inject(Router);

  protected readonly session = this.store.connect;
  protected readonly evaluation = signal<EvaluationDocument | null>(null);
  protected readonly reports = signal<ReportEntry[]>([]);
  protected readonly selectedReport = signal<string>('');
  protected readonly busy = signal(false);
  protected readonly profiling = signal(false);
  protected readonly checkingReachability = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly profileOutcome = signal<SymbolOutcome | null>(null);
  protected readonly reachabilityOutcome = signal<SpecReachabilityOutcome | null>(null);
  protected readonly selectedStrategy = signal<string>('all');
  /** Filtro del gráfico mensual: sigue al general, pero puede desviarse solo. */
  protected readonly chartStrategy = signal<string>('all');
  /** Filtro de trades individuales: mismo patrón que chartStrategy. */
  protected readonly tradesStrategy = signal<string>('all');
  protected readonly tradeSplit = signal<SplitKey>('train');
  protected readonly exportOpen = signal(false);
  protected readonly confirmMode = computed(() => evaluationModeOf(this.evaluation()) === 'confirm');

  protected readonly strategyIds = computed(() => {
    const doc = this.evaluation();
    return doc ? strategyOptions(doc) : ['all'];
  });

  protected readonly comparisonRows = computed(() => {
    const doc = this.evaluation();
    if (!doc) return [];
    return buildComparisonRows(doc, this.selectedStrategy());
  });

  protected readonly monthly = computed<MonthlyBar[]>(() => {
    const doc = this.evaluation();
    return doc ? buildMonthlyBars(doc, this.chartStrategy()) : [];
  });

  protected readonly verdictReasons = computed(() =>
    this.comparisonRows().filter((row) => row.reasons.length > 0),
  );

  protected readonly trainRows = computed(() => this.filteredStrategies('train'));
  protected readonly walkForwardRows = computed(() => this.filteredStrategies('walkForward'));
  protected readonly holdoutRows = computed(() => this.filteredStrategies('holdout'));
  protected readonly stageRows = computed(() => this.filteredStrategies(this.tradeSplit()));
  protected readonly tradeRows = computed(() => this.trades(this.tradeSplit()));

  private chart: IChartApi | null = null;
  private isSeries: ISeriesApi<'Histogram'> | null = null;
  private oosSeries: ISeriesApi<'Histogram'> | null = null;

  ngAfterViewInit(): void {
    if (!this.session()) {
      this.router.navigateByUrl('/');
      return;
    }
    this.refreshReportList();
  }

  ngOnDestroy(): void {
    this.chart?.remove();
  }

  protected run(): void {
    this.launch('develop');
  }

  protected confirmHoldout(): void {
    const ok = window.confirm(
      'Confirmación holdout: corre oos→holdout una vez con las specs actuales. '
        + 'No uses el resultado para retocar umbrales. ¿Continuar?',
    );
    if (!ok) return;
    this.launch('confirm');
  }

  private launch(mode: 'develop' | 'confirm'): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.start(mode).subscribe({
      next: (response) => {
        this.busy.set(false);
        if (!response.ok) {
          this.error.set(response.error || 'Falló el backtest');
          return;
        }
        this.evaluation.set(response.evaluation);
        this.tradeSplit.set(mode === 'confirm' ? 'holdout' : 'train');
        this.refreshChart();
        this.refreshReportList(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error al lanzar el backtest');
      },
    });
  }

  protected onReportChange(name: string): void {
    this.selectedReport.set(name);
    if (!name) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.getReport(name).subscribe({
      next: (doc) => {
        this.busy.set(false);
        this.evaluation.set(doc);
        this.tradeSplit.set(evaluationModeOf(doc) === 'confirm' ? 'holdout' : 'train');
        this.refreshChart();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message || err?.message || 'No se pudo cargar el informe');
      },
    });
  }

  protected profileCatalog(): void {
    const symbol = this.session()?.symbol;
    if (!symbol) {
      this.error.set('Sin símbolo en la sesión');
      return;
    }
    this.profiling.set(true);
    this.error.set(null);
    this.profileOutcome.set(null);
    this.api.catalogProfile([symbol]).subscribe({
      next: (report) => {
        this.profiling.set(false);
        this.profileOutcome.set(report.symbols[0] ?? null);
      },
      error: (err) => {
        this.profiling.set(false);
        this.error.set(err?.message || 'Error al perfilar el catálogo');
      },
    });
  }

  protected checkReachability(): void {
    const symbol = this.session()?.symbol;
    if (!symbol) {
      this.error.set('Sin símbolo en la sesión');
      return;
    }
    this.checkingReachability.set(true);
    this.error.set(null);
    this.api.specReachability([symbol]).subscribe({
      next: (report) => {
        this.checkingReachability.set(false);
        this.reachabilityOutcome.set(report.symbols[0] ?? null);
      },
      error: (err) => {
        this.checkingReachability.set(false);
        this.error.set(err?.message || 'Error al validar alcanzabilidad');
      },
    });
  }

  protected onStrategyChange(id: string): void {
    this.selectedStrategy.set(id);
    this.chartStrategy.set(id);
    this.tradesStrategy.set(id);
    this.refreshChart();
  }

  protected onChartStrategyChange(id: string): void {
    this.chartStrategy.set(id);
    this.refreshChart();
  }

  protected onTradesStrategyChange(id: string): void {
    this.tradesStrategy.set(id);
  }

  protected openExport(): void {
    if (this.evaluation()) {
      this.exportOpen.set(true);
    }
  }

  protected strategies(split: SplitKey): StrategyReport[] {
    return this.evaluation()?.[split]?.strategies ?? [];
  }

  /** Filas de un split respetando el filtro de estrategia. */
  protected filteredStrategies(split: SplitKey): StrategyReport[] {
    return filterByStrategy(this.strategies(split), this.selectedStrategy());
  }

  protected runMeta(split: SplitKey): string {
    const label =
      split === 'train' ? 'train' : split === 'walkForward' ? 'walk-forward' : 'holdout';
    return formatRunHeader(label, this.evaluation()?.[split]?.run);
  }

  protected trades(split: SplitKey): TradeRow[] {
    const doc = this.evaluation();
    if (!doc) return [];
    return collectTrades(doc, split, this.tradesStrategy());
  }

  protected tradeSideSeverity(side: string | undefined): 'success' | 'danger' | 'secondary' {
    if (side === 'BUY' || side === 'LONG') return 'success';
    if (side === 'SELL' || side === 'SHORT') return 'danger';
    return 'secondary';
  }

  protected exitSeverity(
    reason: string | undefined,
  ): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    switch (reason) {
      case 'TARGET':
        return 'success';
      case 'STOP':
        return 'danger';
      case 'LIQUIDATION':
        return 'warn';
      case 'SIGNAL':
        return 'info';
      default:
        return 'secondary';
    }
  }

  private refreshReportList(selectNewest = false): void {
    this.api.listReports().subscribe({
      next: (entries) => {
        this.reports.set(entries);
        if (!entries.length) {
          return;
        }
        if (selectNewest || !this.selectedReport()) {
          const name = entries[0].name;
          this.selectedReport.set(name);
          if (!this.evaluation() || selectNewest) {
            // After a run, evaluation already comes from start; only fetch on first paint.
            if (!selectNewest) {
              this.onReportChange(name);
            }
          }
        }
      },
      error: () => {
        this.reports.set([]);
      },
    });
  }

  private refreshChart(): void {
    setTimeout(() => {
      const host = this.monthChartEl?.nativeElement;
      if (!host) return;
      if (!this.chart) {
        this.chart = createChart(host, {
          height: 260,
          layout: { background: { color: '#111827' }, textColor: '#94a3b8' },
          grid: { vertLines: { color: '#1e2940' }, horzLines: { color: '#1e2940' } },
          rightPriceScale: { borderColor: '#263145' },
          timeScale: { borderColor: '#263145' },
        });
        this.isSeries = this.chart.addHistogramSeries({
          color: '#4c8dff',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
        this.oosSeries = this.chart.addHistogramSeries({
          color: '#22c55e',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
      }
      const bars = this.monthly();
      const isMapped = bars.map((b) => ({
        time: monthToUtc(b.month),
        value: b.is,
        color: b.is >= 0 ? '#4c8dff' : '#365fa8',
      }));
      const oosMapped = bars.map((b) => ({
        time: monthToUtc(b.month),
        value: b.oos,
        color: b.oos >= 0 ? '#22c55e' : '#3f7a55',
      }));
      this.isSeries?.setData(isMapped as never);
      this.oosSeries?.setData(oosMapped as never);
      this.chart.timeScale().fitContent();
    }, 0);
  }
}

function monthToUtc(month: string): string {
  return `${month}-01`;
}
