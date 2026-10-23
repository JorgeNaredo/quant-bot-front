import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { TagModule } from 'primeng/tag';
import { StrategyReport } from '../../../../shared/models/bot-api.model';
import {
  ComparativeRow,
  ComparisonSides,
  deltaText,
  floorTone,
  formatNumber,
  gradeOf,
  verdictSeverity,
  winnerOf,
} from '../../report-data';

@Component({
  selector: 'app-comparison-summaries',
  standalone: true,
  imports: [PaginatorModule, TagModule],
  templateUrl: './comparison-summaries.component.html',
  styleUrl: './comparison-summaries.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonSummariesComponent {
  readonly rows = input.required<ComparativeRow[]>();
  readonly sides = input.required<ComparisonSides>();

  protected readonly pageSizes = [6, 10, 16];
  protected readonly pageSize = signal(6);
  protected readonly page = signal(0);

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.rows().length / this.pageSize())),
  );

  protected readonly currentPage = computed(() =>
    Math.min(this.page(), this.pageCount() - 1),
  );

  protected readonly first = computed(() => this.currentPage() * this.pageSize());

  protected readonly visible = computed(() => {
    const size = this.pageSize();
    const start = this.currentPage() * size;
    return this.rows().slice(start, start + size);
  });

  protected readonly leftWinnerId = computed(() => winnerOf(this.rows(), 'left')?.id ?? null);
  protected readonly rightWinnerId = computed(() => winnerOf(this.rows(), 'right')?.id ?? null);

  protected onPage(event: PaginatorState): void {
    if (event.rows && event.rows !== this.pageSize()) {
      this.pageSize.set(event.rows);
      this.page.set(0);
      return;
    }
    this.page.set(event.page ?? 0);
  }

  protected num(value: number | undefined | null, digits: number): string {
    return formatNumber(value, digits);
  }

  protected delta(value: number | undefined | null, digits: number): string {
    return deltaText(value, digits);
  }

  protected severity(label: string): 'success' | 'warn' | 'danger' | 'secondary' {
    return verdictSeverity(label);
  }

  protected toneOf(letter: string): string {
    return floorTone(letter);
  }

  protected sample(report: StrategyReport | null): string {
    if (!report) return '—';
    return report.sampleEnough ? 'sí' : 'no';
  }

  protected gradedCell(
    report: StrategyReport | null,
    key: string,
    value: number | undefined | null,
    digits: number,
  ): { letter: string; value: string } | null {
    if (!report) return null;
    return { letter: gradeOf(report, key), value: formatNumber(value, digits) };
  }

  protected reasonsText(row: ComparativeRow): string {
    return row.reasons.length ? row.reasons.join(' · ') : '—';
  }

  protected isUp(value: number | undefined): boolean {
    return value !== undefined && value > 0;
  }

  protected isDown(value: number | undefined): boolean {
    return value !== undefined && value < 0;
  }
}
