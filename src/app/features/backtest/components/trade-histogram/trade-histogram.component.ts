import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartDataset,
  LinearScale,
  Tooltip,
} from 'chart.js';
import {
  BarSide,
  HistogramBin,
  TradeHistogram,
  histogramTotal,
} from '../../report-data';
import {
  CHART_GRID,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TOOLTIP_MUTED,
  CHART_TOOLTIP_TEXT,
  chartToken,
} from '../chart-theme';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

type BinKey = 'left' | 'right';

const LEFT_FILL_ALPHA = '8C';
const RIGHT_FILL_ALPHA = '73';

const pctFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

@Component({
  selector: 'app-trade-histogram',
  standalone: true,
  host: { '[class.chart-fill]': 'height() === \'fill\'' },
  template: `
    <div class="chart" [class.chart--fill]="height() === 'fill'" [style.height.px]="heightPx()">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      @if (!hasData()) {
        <p class="chart__empty">Sin operaciones con R.</p>
      }
    </div>
  `,
  styleUrl: './trade-histogram.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeHistogramComponent implements OnDestroy {
  readonly histogram = input.required<TradeHistogram>();
  readonly leftLabel = input<string>('IS');
  readonly rightLabel = input<string>('OOS');
  readonly visible = input<BarSide>('both');
  readonly height = input<number | 'fill'>(260);
  readonly label = input<string>('');

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly injector = inject(Injector);
  private chart: Chart<'bar', number[], string> | null = null;
  private binKeys: BinKey[] = [];

  protected readonly hasData = computed(() => histogramTotal(this.histogram(), this.visible()) > 0);

  protected readonly heightPx = computed(() => {
    const height = this.height();
    return height === 'fill' ? null : height;
  });

  protected readonly ariaLabel = computed(() => {
    const scope = this.label() ? `${this.label()}: ` : '';
    const visible = this.visible();
    const sides =
      visible === 'both'
        ? `${this.leftLabel()} y ${this.rightLabel()}`
        : visible === 'left'
          ? this.leftLabel()
          : this.rightLabel();
    return `${scope}distribución de R por operación de ${sides} en ${this.histogram().bins.length} buckets`;
  });

  private readonly leftColor = chartToken('--primary', '#4c8dff');
  private readonly rightColor = chartToken('--success', '#22c55e');
  private readonly tickColor = chartToken('--text-color-muted', '#64748b');

  constructor() {
    afterNextRender(() => this.createChart(), { injector: this.injector });
    effect(() => {
      const histogram = this.histogram();
      const left = this.leftLabel();
      const right = this.rightLabel();
      const visible = this.visible();
      if (!this.chart) return;
      this.applyData(histogram, left, right, visible);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private createChart(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || this.chart) return;
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: CHART_TOOLTIP_BG,
            borderColor: CHART_TOOLTIP_BORDER,
            borderWidth: 1,
            titleColor: CHART_TOOLTIP_TEXT,
            bodyColor: CHART_TOOLTIP_MUTED,
            padding: 8,
            displayColors: true,
            callbacks: {
              label: (ctx) => {
                const index = ctx.dataIndex;
                const key = this.binKeys[ctx.datasetIndex];
                if (!key) return '';
                const histogram = this.histogram();
                const count = histogram.bins[index]?.[key] ?? 0;
                const total = histogramTotal(histogram, key);
                const share = total ? (count / total) * 100 : 0;
                return `${ctx.dataset.label}: ${count} ops (${pctFormat.format(share)}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: CHART_GRID },
            ticks: {
              color: this.tickColor,
              font: { size: 9 },
              maxRotation: 0,
              autoSkip: false,
              callback: (_value, index) => this.xTickLabel(index),
            },
          },
          y: {
            position: 'right',
            grid: { color: CHART_GRID },
            border: { display: false },
            ticks: {
              color: this.tickColor,
              font: { size: 10 },
              precision: 0,
              callback: (value) => `${Math.round(Number(value))}%`,
            },
          },
        },
      },
    });
    this.applyData(
      this.histogram(),
      this.leftLabel(),
      this.rightLabel(),
      this.visible(),
    );
  }

  private applyData(
    histogram: TradeHistogram,
    left: string,
    right: string,
    visible: BarSide,
  ): void {
    if (!this.chart) return;
    const bins = histogram.bins;
    this.chart.data.labels = bins.map((bin) => bin.label);
    const datasets: ChartDataset<'bar', number[]>[] = [];
    this.binKeys = [];
    if (visible !== 'right' && histogram.leftTotal > 0) {
      this.binKeys.push('left');
      datasets.push({
        label: left,
        data: bins.map((bin) => this.share(bin.left, histogram.leftTotal)),
        backgroundColor: `${this.leftColor}${LEFT_FILL_ALPHA}`,
        borderColor: this.leftColor,
        grouped: false,
        maxBarThickness: 34,
        borderWidth: 1,
        borderRadius: 1,
      });
    }
    if (visible !== 'left' && histogram.rightTotal > 0) {
      this.binKeys.push('right');
      datasets.push({
        label: right,
        data: bins.map((bin) => this.share(bin.right, histogram.rightTotal)),
        backgroundColor: `${this.rightColor}${RIGHT_FILL_ALPHA}`,
        borderColor: this.rightColor,
        grouped: false,
        maxBarThickness: 34,
        borderWidth: 1,
        borderRadius: 1,
      });
    }
    this.chart.data.datasets = datasets;
    this.chart.update();
  }

  private share(count: number, total: number): number {
    return total ? (count / total) * 100 : 0;
  }

  private xTickLabel(index: number): string {
    const bins = this.histogram().bins;
    const bin: HistogramBin | undefined = bins[index];
    if (!bin || bin.edge === null || !Number.isInteger(bin.edge)) {
      return '';
    }
    return String(bin.edge);
  }
}
