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
import {
  ComparisonRow,
  EvaluationDocument,
  ReportEntry,
  SplitRun,
  StrategyReport,
  SymbolOutcome,
  TradeRow,
} from '../../shared/models/bot-api.model';
import { BotApiService } from '../../shared/services/bot-api.service';
import { SessionStoreService } from '../../shared/services/session-store.service';

interface MonthBar {
  month: string;
  is: number;
  oos: number;
}

@Component({
  selector: 'app-backtest-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
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
  protected readonly error = signal<string | null>(null);
  protected readonly profileOutcome = signal<SymbolOutcome | null>(null);
  protected readonly selectedStrategy = signal<string>('all');
  protected readonly tradeSplit = signal<'train' | 'walkForward'>('train');

  protected readonly strategyIds = computed(() => {
    const doc = this.evaluation();
    const ids = new Set<string>();
    for (const row of doc?.train?.strategies ?? []) ids.add(row.id);
    for (const row of doc?.walkForward?.strategies ?? []) ids.add(row.id);
    return ['all', ...Array.from(ids).sort()];
  });

  protected readonly comparisonRows = computed(() => {
    const doc = this.evaluation();
    if (!doc) return [] as Array<{
      id: string;
      trainFloor: string;
      oosFloor: string;
      delta: ComparisonRow['delta'];
      label: string;
      reasons: string[];
    }>;
    const comparisons = indexById(doc.comparison ?? []);
    const verdicts = indexById(doc.verdicts ?? []);
    const ids = orderedIds(doc);
    return ids.map((id) => {
      const cmp = comparisons.get(id);
      const verdict = verdicts.get(id);
      return {
        id,
        trainFloor: cmp?.trainFloor ?? '—',
        oosFloor: cmp?.oosFloor ?? '—',
        delta: cmp?.delta,
        label: verdict?.label ?? '—',
        reasons: verdict?.reasons ?? [],
      };
    });
  });

  protected readonly monthly = computed(() =>
    this.buildMonthly(this.evaluation(), this.selectedStrategy()),
  );

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

  protected disconnect(): void {
    this.store.clear();
    this.router.navigateByUrl('/');
  }

  protected run(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.start().subscribe({
      next: (response) => {
        this.busy.set(false);
        if (!response.ok) {
          this.error.set(response.error || 'Falló el backtest');
          return;
        }
        this.evaluation.set(response.evaluation);
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

  protected onStrategyChange(id: string): void {
    this.selectedStrategy.set(id);
    this.refreshChart();
  }

  protected strategies(split: 'train' | 'walkForward'): StrategyReport[] {
    return this.evaluation()?.[split]?.strategies ?? [];
  }

  protected runMeta(split: 'train' | 'walkForward'): string {
    return formatRunHeader(split === 'train' ? 'train' : 'walk-forward', this.evaluation()?.[split]?.run);
  }

  protected grade(row: StrategyReport | undefined, key: string): string {
    return row?.grades?.[key] ?? '—';
  }

  protected graded(row: StrategyReport, key: string, value: number | undefined | null, digits: number): string {
    const letter = this.grade(row, key);
    if (value === undefined || value === null || Number.isNaN(value)) {
      return letter === '—' ? '—' : `${letter} —`;
    }
    return `${letter} ${value.toFixed(digits)}`;
  }

  protected num(value: number | undefined | null, digits: number): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    return value.toFixed(digits);
  }

  protected exitCount(row: StrategyReport, reason: string): number {
    return row.exits?.[reason] ?? 0;
  }

  protected trades(split: 'train' | 'walkForward'): TradeRow[] {
    const id = this.selectedStrategy();
    const rows: TradeRow[] = [];
    for (const strategy of this.strategies(split)) {
      if (id !== 'all' && strategy.id !== id) continue;
      for (const trade of strategy.trades ?? []) {
        rows.push({ ...trade, strategyId: trade.strategyId ?? strategy.id });
      }
    }
    return rows;
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
          layout: { background: { color: '#151922' }, textColor: '#d1d4dc' },
          grid: { vertLines: { color: '#1f232b' }, horzLines: { color: '#1f232b' } },
          rightPriceScale: { borderColor: '#2a2e39' },
          timeScale: { borderColor: '#2a2e39' },
        });
        this.isSeries = this.chart.addHistogramSeries({
          color: '#3d7eff',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
        this.oosSeries = this.chart.addHistogramSeries({
          color: '#26a69a',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
      }
      const bars = this.monthly();
      const isMapped = bars.map((b) => ({
        time: monthToUtc(b.month),
        value: b.is,
        color: b.is >= 0 ? '#3d7eff' : '#5b7bb8',
      }));
      const oosMapped = bars.map((b) => ({
        time: monthToUtc(b.month),
        value: b.oos,
        color: b.oos >= 0 ? '#26a69a' : '#6f9e97',
      }));
      this.isSeries?.setData(isMapped as never);
      this.oosSeries?.setData(oosMapped as never);
      this.chart.timeScale().fitContent();
    }, 0);
  }

  private buildMonthly(doc: EvaluationDocument | null, strategyId: string): MonthBar[] {
    if (!doc) return [];
    const map = new Map<string, MonthBar>();
    const add = (split: 'train' | 'walkForward', key: 'is' | 'oos') => {
      for (const strategy of doc[split]?.strategies ?? []) {
        if (strategyId !== 'all' && strategy.id !== strategyId) continue;
        for (const trade of strategy.trades ?? []) {
          if (!trade.exitTime) continue;
          const month = trade.exitTime.slice(0, 7);
          const row = map.get(month) ?? { month, is: 0, oos: 0 };
          row[key] += trade.netPnl ?? 0;
          map.set(month, row);
        }
      }
    };
    add('train', 'is');
    add('walkForward', 'oos');
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }
}

function monthToUtc(month: string): string {
  return `${month}-01`;
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (row?.id) map.set(row.id, row);
  }
  return map;
}

function orderedIds(doc: EvaluationDocument): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const row of doc.train?.strategies ?? []) push(row.id);
  for (const row of doc.walkForward?.strategies ?? []) push(row.id);
  for (const row of doc.comparison ?? []) push(row.id);
  for (const row of doc.verdicts ?? []) push(row.id);
  return ids;
}

function formatRunHeader(name: string, run: SplitRun | undefined): string {
  if (!run) return name;
  let ended = run.endedBecause || '?';
  if (run.error) ended = `${ended}: ${run.error}`;
  const days = run.days == null ? '-' : `${run.days.toFixed(0)} d`;
  return [
    name,
    run.profile || '',
    `${run.symbol || ''} ${run.interval || ''}`.trim(),
    `${run.firstBar || '-'} -> ${run.lastBar || '-'}`,
    days,
    `N=${run.trials ?? '?'}`,
    ended,
  ]
    .filter((part) => part.length > 0)
    .join('  ');
}
