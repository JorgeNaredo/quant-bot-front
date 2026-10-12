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
  EvaluationDocument,
  StrategyReport,
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
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedStrategy = signal<string>('all');
  protected readonly detailSplit = signal<'train' | 'walkForward'>('train');

  protected readonly strategyIds = computed(() => {
    const doc = this.evaluation();
    const ids = new Set<string>();
    for (const row of doc?.train?.strategies ?? []) ids.add(row.id);
    for (const row of doc?.walkForward?.strategies ?? []) ids.add(row.id);
    return ['all', ...Array.from(ids).sort()];
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
    }
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
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'Error al lanzar el backtest');
      },
    });
  }

  protected loadLatest(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.latestReport().subscribe({
      next: (doc) => {
        this.busy.set(false);
        this.evaluation.set(doc);
        this.refreshChart();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.message || 'No hay informe reciente');
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

  protected verdict(id: string): string {
    return this.evaluation()?.verdicts?.[id]?.label ?? '—';
  }

  protected grade(row: StrategyReport | undefined, key: string): string {
    return row?.grades?.[key] ?? '—';
  }

  protected oosFloor(id: string): string {
    const row = this.strategies('walkForward').find((s) => s.id === id);
    return this.grade(row, 'floor');
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
