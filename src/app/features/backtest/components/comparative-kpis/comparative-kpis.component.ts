import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import {
  ComparativeDelta,
  ComparativeKpis,
  ComparisonSides,
  deltaText,
  floorTone,
  formatNumber,
  verdictSeverity,
} from '../../report-data';

interface WinnerRow {
  key: string;
  label: string;
  id: string;
  delta: ComparativeDelta;
}

@Component({
  selector: 'app-comparative-kpis',
  standalone: true,
  imports: [TagModule],
  templateUrl: './comparative-kpis.component.html',
  styleUrl: './comparative-kpis.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparativeKpisComponent {
  readonly kpis = input.required<ComparativeKpis>();
  readonly sides = input.required<ComparisonSides>();

  protected readonly winnerRows = computed<WinnerRow[]>(() => {
    const left = this.kpis().delta.leftWinner;
    const right = this.kpis().delta.rightWinner;
    if (left && right && left.id === right.id) {
      return [
        {
          key: 'both',
          label: `${this.sides().leftLabel} y ${this.sides().rightLabel}`,
          id: left.id,
          delta: left.delta,
        },
      ];
    }
    const rows: WinnerRow[] = [];
    if (left) rows.push({ key: 'left', label: this.sides().leftLabel, id: left.id, delta: left.delta });
    if (right) {
      rows.push({ key: 'right', label: this.sides().rightLabel, id: right.id, delta: right.delta });
    }
    return rows;
  });

  protected num(value: number | null | undefined, digits: number): string {
    return formatNumber(value, digits);
  }

  protected delta(value: number | null | undefined, digits: number): string {
    return deltaText(value, digits);
  }

  protected severity(label: string): 'success' | 'warn' | 'danger' | 'secondary' {
    return verdictSeverity(label);
  }

  protected toneOf(letter: string): string {
    return floorTone(letter);
  }

  protected tone(value: number | null | undefined): 'up' | 'down' | 'flat' {
    if (value === null || value === undefined || value === 0) return 'flat';
    return value > 0 ? 'up' : 'down';
  }
}
