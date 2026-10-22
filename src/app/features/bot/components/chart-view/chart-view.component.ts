import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
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
}

interface ActivePosition {
  entryTime: Time;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
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
    this.drawBreakEvenLine();
  }

  private readonly candleStream = inject(CandleStreamService);
  private readonly bookStream = inject(BookStreamService);

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private candleSub: Subscription | null = null;
  private orderSub: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private orderLines: OrderLines | null = null;
  private breakEvenSeries: IPriceLine | null = null;
  private latestCandleTime: Time | null = null;
  private latestClose: number | null = null;
  private followPriceInitialized = false;
  private activePosition: ActivePosition | null = null;
  private extendTimer: ReturnType<typeof setTimeout> | null = null;
  private _breakEvenPrice: number | null = null;

  ngAfterViewInit(): void {
    this.initChart();
    this.subscribeToCandles();
    this.subscribeToOrders();
    this.observeResize();
  }

  ngOnDestroy(): void {
    this.candleSub?.unsubscribe();
    this.orderSub?.unsubscribe();
    this.removeOrderLines();
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
        this.extendEntryLinesToClose();
        break;
    }
  }

  private updateStopLossLine(event: BookEvent): void {
    if (!this.orderLines || !this.activePosition || event.stopPrice == null) return;

    this.activePosition.slPrice = event.stopPrice;
    this.orderLines.stopLoss.applyOptions({ price: event.stopPrice });
  }

  private drawOrderLines(event: BookEvent): void {
    this.removeOrderLines();
    this.clearExtendTimer();

    if (!this.series || event.entryPrice == null) return;

    const time = this.latestCandleTime ?? this.toTime(event.ts);
    const stop = event.stopPrice ?? event.entryPrice;
    const target = event.targetPrice ?? event.entryPrice;

    this.orderLines = {
      entry: this.series.createPriceLine({
        price: event.entryPrice,
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
      }),
      stopLoss: this.series.createPriceLine({
        price: stop,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
      }),
      takeProfit: this.series.createPriceLine({
        price: target,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
      }),
    };

    this.activePosition = {
      entryTime: time,
      entryPrice: event.entryPrice,
      slPrice: stop,
      tpPrice: target,
    };

    this.drawBreakEvenLine();
    this.followPrice(event.entryPrice);
  }

  private drawBreakEvenLine(): void {
    const price = this._breakEvenPrice;
    if (!this.series || price === null || !this.activePosition) {
      if (this.breakEvenSeries) {
        this.series?.removePriceLine(this.breakEvenSeries);
        this.breakEvenSeries = null;
      }
      return;
    }

    if (!this.breakEvenSeries) {
      this.breakEvenSeries = this.series.createPriceLine({
        price,
        color: '#94a3b8',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
      });
    } else {
      this.breakEvenSeries.applyOptions({ price });
    }
  }

  private extendEntryLinesToClose(): void {
    if (!this.activePosition) {
      this.removeOrderLines();
      return;
    }

    this.activePosition = null;

    this.extendTimer = setTimeout(() => this.removeOrderLines(), 2000);
  }

  private clearExtendTimer(): void {
    if (this.extendTimer !== null) {
      clearTimeout(this.extendTimer);
      this.extendTimer = null;
    }
  }

  private removeOrderLines(): void {
    if (!this.series) return;
    if (this.orderLines) {
      this.series.removePriceLine(this.orderLines.entry);
      this.series.removePriceLine(this.orderLines.stopLoss);
      this.series.removePriceLine(this.orderLines.takeProfit);
      this.orderLines = null;
    }
    if (this.breakEvenSeries) {
      this.series.removePriceLine(this.breakEvenSeries);
      this.breakEvenSeries = null;
    }
    this.activePosition = null;
    this.clearExtendTimer();
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

  private toTimeFromMs(ts: number): Time {
    return Math.floor(ts / 1000) as unknown as Time;
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
