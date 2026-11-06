import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import {
  AutoscaleInfoProvider,
  ColorType,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  createChart,
  Time,
} from 'lightweight-charts';
import { Subscription } from 'rxjs';
import { CandleStreamService } from '../../../../shared/services/candle-stream.service';
import { BookStreamService } from '../../../../shared/services/book-stream.service';
import { Candle } from '../../../../shared/models/candle.model';
import { BookEvent } from '../../../../shared/models/bot-api.model';

const PRICE_PRECISION = 5;
const PRICE_MIN_MOVE = 0.00001;

interface OrderLines {
  entry: IPriceLine;
  stopLoss: IPriceLine;
  takeProfit: IPriceLine;
  breakEven: IPriceLine | null;
}

interface ActivePosition {
  strategyId: string;
  shortId: string;
  color: string;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  side: string | null;
}

interface LegendChip {
  id: string;
  shortId: string;
  color: string;
  side: string;
}

@Component({
  selector: 'app-chart-view',
  standalone: true,
  templateUrl: './chart-view.component.html',
  styleUrl: './chart-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartViewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private chartContainer!: ElementRef<HTMLDivElement>;

  @Input() set breakEvenPrice(value: number | null) {
    this._breakEvenPrice = value;
    this.syncBreakEvenLines();
  }

  @Input() set openPositionCount(value: number) {
    this._openPositionCount = value;
    this.syncBreakEvenLines();
  }

  private readonly candleStream = inject(CandleStreamService);
  private readonly bookStream = inject(BookStreamService);

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private candleSub: Subscription | null = null;
  private orderSub: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly orderLines = new Map<string, OrderLines>();
  private readonly positions = new Map<string, ActivePosition>();
  private readonly closeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private latestCandleTime: Time | null = null;
  private latestClose: number | null = null;
  private followPriceInitialized = false;
  private _breakEvenPrice: number | null = null;
  private _openPositionCount = 0;

  protected readonly openLegend = signal<LegendChip[]>([]);

  ngAfterViewInit(): void {
    this.initChart();
    this.subscribeToCandles();
    this.subscribeToOrders();
    this.observeResize();
  }

  ngOnDestroy(): void {
    this.candleSub?.unsubscribe();
    this.orderSub?.unsubscribe();
    this.clearAllPositions();
    this.resizeObserver?.disconnect();
    this.chart?.remove();
    this.chart = null;
    this.series = null;
  }

  private initChart(): void {
    const container = this.chartContainer.nativeElement;
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f17' },
        textColor: '#94a3b8',
      },
      localization: {
        locale: 'en-US',
        priceFormatter: (price: number) => price.toFixed(PRICE_PRECISION),
      },
      grid: {
        vertLines: { color: '#1a2233', style: LineStyle.Dotted },
        horzLines: { color: '#1a2233', style: LineStyle.Dotted },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#263145',
      },
      rightPriceScale: {
        borderColor: '#263145',
      },
      crosshair: {
        mode: 1,
      },
    });

    this.series = this.chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceFormat: {
        type: 'price',
        precision: PRICE_PRECISION,
        minMove: PRICE_MIN_MOVE,
      },
    });

    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    this.volumeSeries.applyOptions({
      color: '#22c55e80',
    });
  }

  private subscribeToCandles(): void {
    this.candleSub = this.candleStream.candles$.subscribe((candle) => {
      this.updateSeries(candle);
    });
  }

  private subscribeToOrders(): void {
    this.orderSub = this.bookStream.events$.subscribe((event) => {
      this.handleBookEvent(event);
    });
  }

  private handleBookEvent(event: BookEvent): void {
    switch (event.type) {
      case 'OPEN':
        this.drawOrderLines(event);
        break;
      case 'UPDATE_STOP':
        this.updateStopLossLine(event);
        break;
      case 'CLOSE':
        this.scheduleRemove(event.strategyId);
        break;
    }
  }

  private updateStopLossLine(event: BookEvent): void {
    const lines = this.orderLines.get(event.strategyId);
    const pos = this.positions.get(event.strategyId);
    if (!lines || !pos || event.stopPrice == null) return;
    pos.slPrice = event.stopPrice;
    lines.stopLoss.applyOptions({ price: event.stopPrice });
  }

  private drawOrderLines(event: BookEvent): void {
    this.clearCloseTimer(event.strategyId);
    this.removeStrategyLines(event.strategyId);

    if (!this.series || event.entryPrice == null) return;

    const shortId = shortStrategyId(event.strategyId);
    const color = strategyColor(event.strategyId);
    const stop = event.stopPrice ?? event.entryPrice;
    const target = event.targetPrice ?? event.entryPrice;

    const lines: OrderLines = {
      entry: this.series.createPriceLine({
        price: event.entryPrice,
        color,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `${shortId} Entry`,
      }),
      stopLoss: this.series.createPriceLine({
        price: stop,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${shortId} SL`,
      }),
      takeProfit: this.series.createPriceLine({
        price: target,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `${shortId} TP`,
      }),
      breakEven: null,
    };

    this.orderLines.set(event.strategyId, lines);
    this.positions.set(event.strategyId, {
      strategyId: event.strategyId,
      shortId,
      color,
      entryPrice: event.entryPrice,
      slPrice: stop,
      tpPrice: target,
      side: event.side,
    });
    this.refreshLegend();
    this.syncBreakEvenLines();
    this.followPrice(event.entryPrice);
  }

  private syncBreakEvenLines(): void {
    if (!this.series) return;
    const showBe = this._openPositionCount === 1 && this._breakEvenPrice != null && this.positions.size === 1;
    for (const [id, lines] of this.orderLines) {
      if (!showBe) {
        if (lines.breakEven) {
          this.series.removePriceLine(lines.breakEven);
          lines.breakEven = null;
        }
        continue;
      }
      const pos = this.positions.get(id);
      if (!pos || this._breakEvenPrice == null) continue;
      if (!lines.breakEven) {
        lines.breakEven = this.series.createPriceLine({
          price: this._breakEvenPrice,
          color: '#94a3b8',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: `${pos.shortId} BE`,
        });
      } else {
        lines.breakEven.applyOptions({ price: this._breakEvenPrice });
      }
    }
  }

  private scheduleRemove(strategyId: string): void {
    this.clearCloseTimer(strategyId);
    const timer = setTimeout(() => {
      this.closeTimers.delete(strategyId);
      this.removeStrategyLines(strategyId);
      this.positions.delete(strategyId);
      this.refreshLegend();
      this.syncBreakEvenLines();
    }, 2000);
    this.closeTimers.set(strategyId, timer);
  }

  private clearCloseTimer(strategyId: string): void {
    const timer = this.closeTimers.get(strategyId);
    if (timer != null) {
      clearTimeout(timer);
      this.closeTimers.delete(strategyId);
    }
  }

  private removeStrategyLines(strategyId: string): void {
    if (!this.series) return;
    const lines = this.orderLines.get(strategyId);
    if (!lines) return;
    this.series.removePriceLine(lines.entry);
    this.series.removePriceLine(lines.stopLoss);
    this.series.removePriceLine(lines.takeProfit);
    if (lines.breakEven) {
      this.series.removePriceLine(lines.breakEven);
    }
    this.orderLines.delete(strategyId);
  }

  private clearAllPositions(): void {
    for (const id of [...this.closeTimers.keys()]) {
      this.clearCloseTimer(id);
    }
    for (const id of [...this.orderLines.keys()]) {
      this.removeStrategyLines(id);
    }
    this.positions.clear();
    this.refreshLegend();
  }

  private refreshLegend(): void {
    this.openLegend.set(
      [...this.positions.values()].map((p) => ({
        id: p.strategyId,
        shortId: p.shortId,
        color: p.color,
        side: p.side ?? '—',
      })),
    );
  }

  private updateSeries(candle: Candle): void {
    if (!this.series) return;
    const time = this.toTime(candle.timestamp);
    const timeNum = time as number;
    if (this.latestCandleTime !== null && timeNum < (this.latestCandleTime as number)) {
      return;
    }
    this.latestCandleTime = time;
    this.series.update({
      time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });

    if (this.volumeSeries) {
      const volumeColor = candle.close >= candle.open ? '#22c55e80' : '#ef444480';
      this.volumeSeries.update({
        time,
        value: candle.volume,
        color: volumeColor,
      });
    }

    this.followPrice(candle.close);
  }

  private initFollowPrice(): void {
    if (this.followPriceInitialized || !this.series) return;
    this.followPriceInitialized = true;

    const provider: AutoscaleInfoProvider = (base) => {
      const baseInfo = base();
      if (!baseInfo) return null;

      const c = this.latestClose;
      if (c === null) return baseInfo;

      const range = baseInfo.priceRange;
      const totalRange = range.maxValue - range.minValue;
      if (totalRange <= 0) return baseInfo;

      const margin = totalRange * 0.15;

      if (c > range.maxValue - margin || c < range.minValue + margin) {
        const halfRange = totalRange / 2;
        return {
          priceRange: {
            minValue: c - halfRange,
            maxValue: c + halfRange,
          },
        };
      }

      return baseInfo;
    };

    this.series.applyOptions({ autoscaleInfoProvider: provider });
  }

  private followPrice(close: number): void {
    this.latestClose = close;
    this.initFollowPrice();
  }

  private toTime(isoTimestamp: string): Time {
    return Math.floor(new Date(isoTimestamp).getTime() / 1000) as unknown as Time;
  }

  private observeResize(): void {
    const container = this.chartContainer.nativeElement;
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!this.chart) return;
      const { width, height } = entries[0].contentRect;
      this.chart.resize(width, height);
    });
    this.resizeObserver.observe(container);
  }
}

function shortStrategyId(id: string): string {
  if (id.length <= 14) return id;
  const parts = id.split(/[-_./]/).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts.slice(-2).join('-');
    return tail.length <= 14 ? tail : tail.slice(0, 14);
  }
  return id.slice(0, 14);
}

function strategyColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 72% 58%)`;
}
