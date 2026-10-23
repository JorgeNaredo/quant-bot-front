import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  ViewChild,
  afterNextRender,
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
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import {
  EvaluationDocument,
  ReportEntry,
  SpecReachabilityOutcome,
  SymbolOutcome,
} from '../../shared/models/bot-api.model';
import { BotApiService } from '../../shared/services/bot-api.service';
import { SessionStoreService } from '../../shared/services/session-store.service';
import {
  ComparativeSort,
  MonthlyBar,
  SplitKey,
  buildComparativeRows,
  buildMonthlyBars,
  collectTrades,
  comparativeKpis,
  comparisonSides,
  filterByStrategy,
  formatRunHeader,
  sortComparativeRows,
  splitStrategies,
  strategyOptions,
} from './report-data';
import { ReportExportComponent } from './report-export/report-export.component';
import { ComparisonSummariesComponent } from './components/comparison-summaries/comparison-summaries.component';
import { ComparativeKpisComponent } from './components/comparative-kpis/comparative-kpis.component';
import { StrategyDetailsComponent } from './components/strategy-details/strategy-details.component';

type DetailTab = 'strategies' | 'trades' | 'stages' | 'curves';

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
    SelectButtonModule,
    TableModule,
    TabsModule,
    TagModule,
    StrategyDetailsComponent,
    ComparisonSummariesComponent,
    ComparativeKpisComponent,
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
  private readonly injector = inject(Injector);

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
  protected readonly comparativeSort = signal<ComparativeSort>('verdict');
  protected readonly detailSplit = signal<SplitKey>('train');
  protected readonly activeTab = signal<DetailTab>('strategies');
  protected readonly exportOpen = signal(false);

  protected readonly sides = computed(() => comparisonSides(this.evaluation()));
  protected readonly confirmMode = computed(() => this.sides().mode === 'confirm');

  protected readonly strategyIds = computed(() => {
    const doc = this.evaluation();
    return doc ? strategyOptions(doc) : ['all'];
  });

  protected readonly comparativeRows = computed(() => {
    const doc = this.evaluation();
    if (!doc) return [];
    return sortComparativeRows(
      buildComparativeRows(doc, this.selectedStrategy()),
      this.comparativeSort(),
    );
  });

  protected readonly kpis = computed(() => {
    const doc = this.evaluation();
    return comparativeKpis(doc ? buildComparativeRows(doc, this.selectedStrategy()) : []);
  });

  protected readonly splitOptions = computed(() => {
    const sides = this.sides();
    return [
      { label: sides.leftLabel, value: sides.left },
      { label: sides.rightLabel, value: sides.right },
    ];
  });

  protected readonly detailStrategyRows = computed(() => {
    const doc = this.evaluation();
    if (!doc) return [];
    return filterByStrategy(splitStrategies(doc, this.detailSplit()), this.selectedStrategy());
  });

  protected readonly tradeRows = computed(() => {
    const doc = this.evaluation();
    return doc ? collectTrades(doc, this.detailSplit(), this.selectedStrategy()) : [];
  });

  protected readonly monthly = computed<MonthlyBar[]>(() => {
    const doc = this.evaluation();
    return doc ? buildMonthlyBars(doc, this.selectedStrategy()) : [];
  });

  private chart: IChartApi | null = null;
  private leftSeries: ISeriesApi<'Histogram'> | null = null;
  private rightSeries: ISeriesApi<'Histogram'> | null = null;

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
        if (!response.ok || !response.evaluation) {
          this.error.set(response.error || 'Falló el backtest');
          return;
        }
        this.applyEvaluation(response.evaluation);
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
        this.applyEvaluation(doc);
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
    this.refreshChart();
  }

  protected onTabChange(tab: string | number | undefined): void {
    this.activeTab.set((tab ?? 'strategies') as DetailTab);
    if (tab === 'curves') {
      afterNextRender(() => this.refreshChart(), { injector: this.injector });
    }
  }

  protected openExport(): void {
    if (this.evaluation()) {
      this.exportOpen.set(true);
    }
  }

  protected runMeta(side: 'left' | 'right'): string {
    const doc = this.evaluation();
    if (!doc) return '';
    const sides = this.sides();
    const split = side === 'left' ? sides.left : sides.right;
    const label = side === 'left' ? sides.leftLabel : sides.rightLabel;
    return formatRunHeader(label, doc[split]?.run);
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

  private applyEvaluation(doc: EvaluationDocument): void {
    this.evaluation.set(doc);
    this.selectedStrategy.set('all');
    this.detailSplit.set(comparisonSides(doc).left);
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
      const width = host.clientWidth;
      const bars = this.monthly();
      if (!this.chart) {
        if (!width) return;
        this.chart = createChart(host, {
          width,
          height: 260,
          layout: { background: { color: '#111827' }, textColor: '#94a3b8' },
          grid: { vertLines: { color: '#1e2940' }, horzLines: { color: '#1e2940' } },
          rightPriceScale: { borderColor: '#263145' },
          timeScale: { borderColor: '#263145' },
        });
        this.leftSeries = this.chart.addHistogramSeries({
          color: '#4c8dff',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
        this.rightSeries = this.chart.addHistogramSeries({
          color: '#22c55e',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
      }
      if (!width) return;
      this.chart.resize(width, 260);
      const leftMapped = bars.map((bar) => ({
        time: monthToUtc(bar.month),
        value: bar.left,
        color: bar.left >= 0 ? '#4c8dff' : '#365fa8',
      }));
      const rightMapped = bars.map((bar) => ({
        time: monthToUtc(bar.month),
        value: bar.right,
        color: bar.right >= 0 ? '#22c55e' : '#3f7a55',
      }));
      this.leftSeries?.setData(leftMapped as never);
      this.rightSeries?.setData(rightMapped as never);
      this.chart.timeScale().fitContent();
    }, 0);
  }
}

function monthToUtc(month: string): string {
  return `${month}-01`;
}
