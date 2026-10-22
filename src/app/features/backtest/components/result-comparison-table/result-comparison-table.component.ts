import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ComparisonViewRow, formatNumber } from '../../report-data';

@Component({
  selector: 'app-result-comparison-table',
  standalone: true,
  imports: [TableModule, TagModule],
  templateUrl: './result-comparison-table.component.html',
  styleUrl: './result-comparison-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultComparisonTableComponent {
  readonly rows = input.required<ComparisonViewRow[]>();
  readonly confirmMode = input(false);

  protected readonly leftLabel = computed(() => (this.confirmMode() ? 'OOS' : 'Train'));
  protected readonly rightLabel = computed(() => (this.confirmMode() ? 'Holdout' : 'OOS'));

  protected num(value: number | undefined | null, digits: number): string {
    return formatNumber(value, digits);
  }

  protected verdictSeverity(label: string): 'success' | 'warn' | 'danger' | 'secondary' {
    const value = label.toLowerCase();
    if (value === 'confirmed' || value === 'candidate') return 'success';
    if (value === 'inconclusive') return 'warn';
    if (value === 'failed') return 'danger';
    return 'secondary';
  }
}
