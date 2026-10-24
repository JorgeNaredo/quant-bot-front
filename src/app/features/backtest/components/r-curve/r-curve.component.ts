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
  BarElement,
  CategoryScale,
  Chart,
  ChartDataset,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { BarSide, CumulativeR, cumulativeCount } from '../../report-data';
import {
  CHART_GRID,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TOOLTIP_MUTED,
  CHART_TOOLTIP_TEXT,
  chartToken,
} from '../chart-theme';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  BarElement,
);

const R_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Component({
  selector: 'app-r-curve',
  standalone: true,
  host: { '[class.rc--fill]': 'height() === \'fill\'' },
  template: `
    <div class="chart" [class.chart--fill]="height() === 'fill'" [style.height.px]="heightPx()">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      @if (!hasData()) {
        <p class="chart__empty">Sin operaciones con R.</p>
      }
    </div>
  `,
  styleUrl: './r-curve.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RCurveComponent implements OnDestroy {
  readonly series = input.required<CumulativeR>();
  readonly leftLabel = input<string>('IS');
  readonly rightLabel = input<string>('OOS');
  readonly visible = input<BarSide>('both');
  readonly height = input<number | 'fill'>(260);
  readonly label = input<string>('');

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly injector = inject(Injector);
  private chart: Chart<'line', { x: number; y: number }[]> | null = null;

  protected readonly hasData = computed(() => cumulativeCount(this.series(), this.visible()) > 0);

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
    return `${scope}R acumulado por operación de ${sides}`;
  });

  private readonly leftColor = chartToken('--primary', '#4c8dff');
  private readonly rightColor = chartToken('--success', '#22c55e');
  private readonly tickColor = chartToken('--text-color-muted', '#64748b');

  constructor() {
    afterNextRender(() => this.createChart(), { injector: this.injector });
    effect(() => {
      const series = this.series();
      const left = this.leftLabel();
      const right = this.rightLabel();
      const visible = this.visible();
      if (!this.chart) return;
      this.applyData(series, left, right, visible);
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
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        parsing: false,
        normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: CHART_TOOLTIP_BG,
            borderColor: CHART_TOOLTIP_BORDER,
            borderWidth: 1,
            titleColor: CHART_TOOLTIP_TEXT,
            bodyColor: CHART_TOOLTIP_MUTED,
            padding: 8,
            callbacks: {
              title: (items) => `operación #${items.length ? items[0].parsed.x : 0}`,
              label: (ctx) => {
                const y = (ctx.parsed as { y: number }).y;
                return `${ctx.dataset.label}: ${this.rText(y)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: 1,
            grid: { color: CHART_GRID },
            border: { color: CHART_GRID },
            ticks: {
              color: this.tickColor,
              font: { size: 9 },
              maxTicksLimit: 6,
              format: { useGrouping: false },
            },
          },
          y: {
            position: 'right',
            grid: { color: CHART_GRID },
            border: { display: false },
            ticks: {
              color: this.tickColor,
              font: { size: 10 },
              callback: (value) => R_FORMAT.format(Number(value)),
            },
          },
        },
      },
    });
    this.applyData(
      this.series(),
      this.leftLabel(),
      this.rightLabel(),
      this.visible(),
    );
  }

  private applyData(
    series: CumulativeR,
    left: string,
    right: string,
    visible: BarSide,
  ): void {
    if (!this.chart) return;
    const datasets: ChartDataset<'line', { x: number; y: number }[]>[] = [];
    if (visible !== 'right' && series.left.length > 0) {
      datasets.push(this.dataset(left, series.left, this.leftColor));
    }
    if (visible !== 'left' && series.right.length > 0) {
      datasets.push(this.dataset(right, series.right, this.rightColor));
    }
    this.chart.data.datasets = datasets;
    this.chart.update();
  }

  private dataset(label: string, values: number[], color: string): ChartDataset<'line', { x: number; y: number }[]> {
    return {
      label,
      data: values.map((y, index) => ({ x: index + 1, y })),
      borderColor: color,
      borderWidth: 1.6,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 1,
      tension: 0,
    };
  }

  private rText(value: number): string {
    const text = R_FORMAT.format(Math.abs(value));
    if (value > 0) return `+${text}R`;
    if (value < 0) return `-${text}R`;
    return '0.00R';
  }
}
