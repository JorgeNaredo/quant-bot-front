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
import { BarSide, MonthlyBar, sliceMonthlyBars } from '../../report-data';
import {
  CHART_GRID,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TOOLTIP_MUTED,
  CHART_TOOLTIP_TEXT,
  chartToken,
} from '../chart-theme';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const NEGATIVE_LEFT = '#365fa8';
const NEGATIVE_RIGHT = '#3f7a55';

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const monthFormat = new Intl.DateTimeFormat('es', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

@Component({
  selector: 'app-monthly-chart',
  standalone: true,
  host: { '[class.chart-fill]': 'height() === \'fill\'' },
  template: `
    <div class="chart" [class.chart--fill]="height() === 'fill'" [style.height.px]="heightPx()">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      @if (!hasData()) {
        <p class="chart__empty">Sin operaciones cerradas.</p>
      }
    </div>
  `,
  styleUrl: './monthly-chart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyChartComponent implements OnDestroy {
  readonly bars = input.required<MonthlyBar[]>();
  readonly leftLabel = input<string>('IS');
  readonly rightLabel = input<string>('OOS');
  readonly visible = input<BarSide>('both');
  readonly height = input<number | 'fill'>(260);
  readonly label = input<string>('');

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly injector = inject(Injector);
  private chart: Chart<'bar', number[], string> | null = null;

  protected readonly shown = computed(() => sliceMonthlyBars(this.bars(), this.visible()));

  protected readonly hasData = computed(() => this.shown().length > 0);

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
    return `${scope}ganancias mensuales de ${sides} en ${this.shown().length} meses`;
  });

  private readonly leftColor = chartToken('--primary', '#4c8dff');
  private readonly rightColor = chartToken('--success', '#22c55e');
  private readonly tickColor = chartToken('--text-color-muted', '#64748b');

  constructor() {
    afterNextRender(() => this.createChart(), { injector: this.injector });
    effect(() => {
      const bars = this.shown();
      const left = this.leftLabel();
      const right = this.rightLabel();
      const visible = this.visible();
      if (!this.chart) return;
      this.applyData(bars, left, right, visible);
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
              label: (ctx) => `${ctx.dataset.label}: ${money.format(ctx.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: CHART_GRID },
            ticks: {
              color: this.tickColor,
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
            },
          },
          y: {
            position: 'right',
            grid: { color: CHART_GRID },
            border: { display: false },
            ticks: {
              color: this.tickColor,
              font: { size: 10 },
              callback: (value) => compact.format(Number(value)),
            },
          },
        },
      },
    });
    this.applyData(
      this.shown(),
      this.leftLabel(),
      this.rightLabel(),
      this.visible(),
    );
  }

  private applyData(
    bars: MonthlyBar[],
    left: string,
    right: string,
    visible: BarSide,
  ): void {
    if (!this.chart) return;
    this.chart.data.labels = bars.map((bar) => this.monthLabel(bar.month));
    const datasets: ChartDataset<'bar', number[]>[] = [];
    if (visible !== 'right') {
      datasets.push({
        label: left,
        data: bars.map((bar) => bar.left),
        backgroundColor: bars.map((bar) => (bar.left >= 0 ? this.leftColor : NEGATIVE_LEFT)),
        borderRadius: 2,
        maxBarThickness: 18,
      });
    }
    if (visible !== 'left') {
      datasets.push({
        label: right,
        data: bars.map((bar) => bar.right),
        backgroundColor: bars.map((bar) => (bar.right >= 0 ? this.rightColor : NEGATIVE_RIGHT)),
        borderRadius: 2,
        maxBarThickness: 18,
      });
    }
    this.chart.data.datasets = datasets;
    this.chart.update();
  }

  private monthLabel(month: string): string {
    const [year, index] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, index - 1, 1));
    return monthFormat.format(date);
  }


}
