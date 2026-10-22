import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { StrategyReport } from '../../../../shared/models/bot-api.model';
import { formatNumber, gradeOf, gradedOf } from '../../report-data';

@Component({
  selector: 'app-strategy-summary-table',
  standalone: true,
  imports: [TableModule, TagModule],
  templateUrl: './strategy-summary-table.component.html',
  styleUrl: './strategy-summary-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrategySummaryTableComponent {
  readonly rows = input.required<StrategyReport[]>();

  protected grade(row: StrategyReport, key: string): string {
    return gradeOf(row, key);
  }

  protected gradeSeverity(
    row: StrategyReport,
    key: string,
  ): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const letter = gradeOf(row, key).charAt(0).toUpperCase();
    if (letter === 'A') return 'success';
    if (letter === 'B') return 'info';
    if (letter === 'C') return 'warn';
    if (letter === 'D' || letter === 'F') return 'danger';
    return 'secondary';
  }

  protected graded(
    row: StrategyReport,
    key: string,
    value: number | undefined | null,
    digits: number,
  ): string {
    return gradedOf(row, key, value, digits);
  }

  protected num(value: number | undefined | null, digits: number): string {
    return formatNumber(value, digits);
  }
}
