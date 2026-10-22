import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { StrategyReport } from '../../../../shared/models/bot-api.model';
import { exitCountOf, formatNumber } from '../../report-data';

@Component({
  selector: 'app-strategy-details',
  standalone: true,
  imports: [TableModule],
  templateUrl: './strategy-details.component.html',
  styleUrl: './strategy-details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrategyDetailsComponent {
  readonly rows = input.required<StrategyReport[]>();

  protected num(value: number | undefined | null, digits: number): string {
    return formatNumber(value, digits);
  }

  protected exitCount(row: StrategyReport, reason: string): number {
    return exitCountOf(row, reason);
  }
}
