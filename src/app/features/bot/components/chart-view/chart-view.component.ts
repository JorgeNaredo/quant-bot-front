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
import { OrderStreamService } from '../../../../shared/services/order-stream.service';
import { Candle } from '../../../../shared/models/candle.model';
import { ExecutionReport } from '../../../../shared/models/execution-report.model';

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
  private readonly orderStream = inject(OrderStreamService);

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
        background: { type: ColorType.Solid, color: '#0e1116' },
        textColor: '#d1d4dc',
      },
      localization: {
        locale: 'en-US',
        priceFormatter: (price: number) => price.toFixed(PRICE_PRECISION),
      },
      grid: {
        vertLines: { color: '#1f232b', style: LineStyle.Dotted },
        horzLines: { color: '#1f232b', style: LineStyle.Dotted },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#2a2e39',
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
      crosshair: {
        mode: 1,
      },
    });

    this.series = this.chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
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
      color: '#26a69a80',
    });
  }

  private subscribeToCandles(): void {
    this.candleSub = this.candleStream.candles$.subscribe((candle) => {
      this.updateSeries(candle);
    });
  }

  private subscribeToOrders(): void {
    this.orderSub = this.orderStream.execution$.subscribe((report) => {
      this.handleExecution(report);
    });
  }

  private handleExecution(report: ExecutionReport): void {
    switch (report.type) {
      case 'ORDER_FILLED':
        this.drawOrderLines(report);
        break;
      case 'STOP_LOSS_UPDATED':
        this.updateStopLossLine(report);
        break;
      case 'STOP_LOSS_HIT':
      case 'TAKE_PROFIT_HIT':
      case 'ORDER_CANCELLED':
      case 'LIQUIDATED':
      case 'POSITION_CLOSED':
        this.extendEntryLinesToClose(report);
        break;
    }
  }

  private updateStopLossLine(report: ExecutionReport): void {
    if (!this.orderLines || !this.activePosition) return;

    this.activePosition.slPrice = report.stopLoss;
    this.orderLines.stopLoss.applyOptions({ price: report.stopLoss });
  }

  private drawOrderLines(report: ExecutionReport): void {
    this.removeOrderLines();
    this.clearExtendTimer();

    if (!this.series) return;

    const time = this.latestCandleTime ?? this.toTimeFromMs(report.timestamp);

    this.orderLines = {
      entry: this.series.createPriceLine({
        price: report.price,
        color: '#ffd54f',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
      }),
      stopLoss: this.series.createPriceLine({
        price: report.stopLoss,
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
      }),
      takeProfit: this.series.createPriceLine({
        price: report.takeProfit,
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
      }),
    };

    this.activePosition = {
      entryTime: time,
      entryPrice: report.price,
      slPrice: report.stopLoss,
      tpPrice: report.takeProfit,
    };

    this.drawBreakEvenLine();
    this.followPrice(report.price);
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
        color: '#9ea4b0',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
      });
    } else {
      this.breakEvenSeries.applyOptions({ price });
    }
  }

  private extendEntryLinesToClose(_report: ExecutionReport): void {
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
	    if (this.latestCandleTime !== null && (time as number) <= (this.latestCandleTime as number)) {
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
	      const volumeColor = candle.close >= candle.open ? '#26a69a80' : '#ef535080';
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
