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
  LinearScale,
  Tooltip,
} from 'chart.js';
import { MonthlyBar } from '../../report-data';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const NEGATIVE_LEFT = '#365fa8';
const NEGATIVE_RIGHT = '#3f7a55';
const TOOLTIP_BG = '#182033';
const TOOLTIP_BORDER = '#263145';
const TOOLTIP_TEXT = '#e8edf5';
const TOOLTIP_MUTED = '#94a3b8';
const GRID = 'rgba(38, 49, 69, 0.55)';

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
  template: `
    <div class="chart">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      @if (!bars().length) {
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

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly injector = inject(Injector);
  private chart: Chart<'bar', number[], string> | null = null;

  protected readonly ariaLabel = computed(
    () =>
      `Ganancias mensuales de ${this.leftLabel()} y ${this.rightLabel()}`
      + ` en ${this.bars().length} meses`,
  );

  private readonly leftColor = this.token('--primary', '#4c8dff');
  private readonly rightColor = this.token('--success', '#22c55e');
  private readonly tickColor = this.token('--text-color-muted', '#64748b');

  constructor() {
    afterNextRender(() => this.createChart(), { injector: this.injector });
    effect(() => {
      const bars = this.bars();
      const left = this.leftLabel();
      const right = this.rightLabel();
      if (!this.chart) return;
      this.applyData(bars, left, right);
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
            backgroundColor: TOOLTIP_BG,
            borderColor: TOOLTIP_BORDER,
            borderWidth: 1,
            titleColor: TOOLTIP_TEXT,
            bodyColor: TOOLTIP_MUTED,
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
            border: { color: GRID },
            ticks: {
              color: this.tickColor,
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
            },
          },
          y: {
            position: 'right',
            grid: { color: GRID },
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
    this.applyData(this.bars(), this.leftLabel(), this.rightLabel());
  }

  private applyData(bars: MonthlyBar[], left: string, right: string): void {
    if (!this.chart) return;
    this.chart.data.labels = bars.map((bar) => this.monthLabel(bar.month));
    this.chart.data.datasets = [
      {
        label: left,
        data: bars.map((bar) => bar.left),
        backgroundColor: bars.map((bar) => (bar.left >= 0 ? this.leftColor : NEGATIVE_LEFT)),
        borderRadius: 2,
        maxBarThickness: 18,
      },
      {
        label: right,
        data: bars.map((bar) => bar.right),
        backgroundColor: bars.map((bar) => (bar.right >= 0 ? this.rightColor : NEGATIVE_RIGHT)),
        borderRadius: 2,
        maxBarThickness: 18,
      },
    ];
    this.chart.update();
  }

  private monthLabel(month: string): string {
    const [year, index] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, index - 1, 1));
    return monthFormat.format(date);
  }

  private token(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }
}
