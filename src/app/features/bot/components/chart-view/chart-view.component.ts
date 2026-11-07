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
/** Padding vertical sobre el OHLC reciente. */
const CANDLE_SCALE_PAD = 0.2;
/** Solo las últimas N velas mandan en el eje Y (historial largo aplasta el movimiento). */
const AUTOSCALE_BARS = 48;
/** Colores de rol = CSS `--danger` / `--success` / `--text-color-secondary` (LWC solo #hex/rgba). */
const ROLE_SL = '#ef4444';
const ROLE_TP = '#22c55e';
const ROLE_BE = '#94a3b8';

interface OrderLines {
  entry: IPriceLine;
  stopLoss: IPriceLine;
  takeProfit: IPriceLine | null;
  breakEven: IPriceLine | null;
}

interface ActivePosition {
  strategyId: string;
  shortId: string;
  color: string;
  entryPrice: number;
  slPrice: number;
  tpPrice: number | null;
  side: string | null;
}

interface LegendChip {
  id: string;
  shortId: string;
  color: string;
  side: string;
}

/** BE neto por estrategia (modo independent: N líneas). */
export interface BreakEvenLevel {
  strategyId: string;
  price: number;
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

  @Input() set breakEvens(levels: BreakEvenLevel[] | null) {
    const next = levels ?? [];
    if (sameBreakEvens(this._breakEvens, next)) return;
    this._breakEvens = next.map((l) => ({ ...l }));
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
  /** Ring buffer propio: el autoscale no depende de dataByIndex ni de price lines. */
  private readonly recentHighs: number[] = [];
  private readonly recentLows: number[] = [];
  private _breakEvens: BreakEvenLevel[] = [];

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
      // Escala solo con velas: Entry/SL/TP/BE son overlay y no dilatan el eje Y.
      autoscaleInfoProvider: this.candleOnlyAutoscale,
    });

    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      visible: false,
    });
    this.volumeSeries.applyOptions({
      color: 'rgba(34, 197, 94, 0.5)',
    });
  }

  /**
   * Autoscale solo con OHLC reciente (ring buffer). Entry/SL/TP pueden quedar
   * fuera de vista: son overlay; no deben mandar en el eje.
   */
  private readonly candleOnlyAutoscale: AutoscaleInfoProvider = () => {
    try {
      const range = this.recentCandlePriceRange();
      if (!range) return null;
      const span = Math.max(range.max - range.min, PRICE_MIN_MOVE);
      const pad = span * CANDLE_SCALE_PAD;
      return {
        priceRange: {
          minValue: range.min - pad,
          maxValue: range.max + pad,
        },
      };
    } catch {
      return null;
    }
  };

  private recentCandlePriceRange(): { min: number; max: number } | null {
    if (this.recentHighs.length === 0 || this.recentLows.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const h of this.recentHighs) if (h > max) max = h;
    for (const l of this.recentLows) if (l < min) min = l;
    if (this.latestClose != null) {
      min = Math.min(min, this.latestClose);
      max = Math.max(max, this.latestClose);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }

  private pushRecentExtremes(high: number, low: number): void {
    this.recentHighs.push(high);
    this.recentLows.push(low);
    while (this.recentHighs.length > AUTOSCALE_BARS) this.recentHighs.shift();
    while (this.recentLows.length > AUTOSCALE_BARS) this.recentLows.shift();
  }

  /** Mantener el borde derecho pegado: createPriceLine puede soltar el sticky scroll. */
  private stickToRealtime(): void {
    this.chart?.timeScale().scrollToRealTime();
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
    const target =
      event.targetPrice != null && Number.isFinite(event.targetPrice)
        ? event.targetPrice
        : null;

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
        color: ROLE_SL,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${shortId} SL`,
      }),
      takeProfit:
        target != null
          ? this.series.createPriceLine({
              price: target,
              color: ROLE_TP,
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: `${shortId} TP`,
            })
          : null,
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
    this.stickToRealtime();
  }

  private syncBreakEvenLines(): void {
    if (!this.series) return;
    const byId = new Map(this._breakEvens.map((l) => [l.strategyId, l.price]));
    for (const [id, lines] of this.orderLines) {
      const pos = this.positions.get(id);
      const price = byId.get(id);
      if (pos == null || price == null || !Number.isFinite(price)) {
        if (lines.breakEven) {
          this.series.removePriceLine(lines.breakEven);
          lines.breakEven = null;
        }
        continue;
      }
      const title = `${pos.shortId} BE`;
      if (!lines.breakEven) {
        lines.breakEven = this.series.createPriceLine({
          price,
          color: ROLE_BE,
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title,
        });
      } else {
        lines.breakEven.applyOptions({ price, title, color: ROLE_BE });
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
    if (lines.takeProfit) {
      this.series.removePriceLine(lines.takeProfit);
    }
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
    const sameBar = this.latestCandleTime !== null && timeNum === (this.latestCandleTime as number);
    this.latestCandleTime = time;
    this.latestClose = candle.close;
    if (sameBar && this.recentHighs.length > 0) {
      const i = this.recentHighs.length - 1;
      this.recentHighs[i] = Math.max(this.recentHighs[i], candle.high);
      this.recentLows[i] = Math.min(this.recentLows[i], candle.low);
    } else {
      this.pushRecentExtremes(candle.high, candle.low);
    }
    try {
      this.series.update({
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
      if (this.volumeSeries) {
        const volumeColor = candle.close >= candle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
        this.volumeSeries.update({
          time,
          value: candle.volume,
          color: volumeColor,
        });
      }
      this.stickToRealtime();
    } catch (err) {
      console.error('chart series.update failed', err, candle);
    }
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

function sameBreakEvens(a: BreakEvenLevel[], b: BreakEvenLevel[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].strategyId !== b[i].strategyId || a[i].price !== b[i].price) return false;
  }
  return true;
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
  // lightweight-charts solo parsea #hex / rgb / rgba (no hsl).
  return hslToHex(hash % 360, 0.72, 0.58);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
