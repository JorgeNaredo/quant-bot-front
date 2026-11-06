import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import { AccordionModule } from 'primeng/accordion';
import { FormsModule } from '@angular/forms';
import { AccountInfo } from '../../../../shared/models/account-info.model';
import { StrategyAccountRow } from '../../../../shared/models/strategy-account.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [AccordionModule, FormsModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.collapsed]': 'collapsed()',
    '[class.sidebar-host--paper]': 'profile === "paper"',
    '[class.sidebar-host--live]': 'profile === "live"',
    '[class.sidebar-host--backtest]': 'profile === "backtest"',
  },
})
export class SidebarComponent {
  @Input({ required: true }) connected!: boolean;
  @Input({ required: true }) operating!: boolean;
  @Input({ required: true }) accountInfo!: AccountInfo | null;
  @Input({ required: true }) profitLocked!: number | null;
  @Input() profile = '';
  @Input() symbol = '';
  @Input() busy = false;
  @Input() error: string | null = null;
  @Input() selectorMode = 'single-slot';
  /** En backtest slow-sim el arranque vive en /backtest. */
  @Input() startDisabled = false;
  @Input() startLabel = 'Iniciar';
  @Input() playbackPaused = false;
  @Input() playbackSpeed = 1;

  private _strategyAccounts: StrategyAccountRow[] = [];
  private seededIds = '';

  @Input()
  set strategyAccounts(rows: StrategyAccountRow[]) {
    this._strategyAccounts = rows ?? [];
    const key = this._strategyAccounts.map((r) => r.id).join('|');
    if (key && key !== this.seededIds) {
      this.seededIds = key;
      this.accordionValue.set(this._strategyAccounts.map((r) => r.id));
    }
  }

  get strategyAccounts(): StrategyAccountRow[] {
    return this._strategyAccounts;
  }

  @Output() startBot = new EventEmitter<void>();
  @Output() stopBot = new EventEmitter<void>();
  @Output() pausePlayback = new EventEmitter<void>();
  @Output() resumePlayback = new EventEmitter<void>();
  @Output() playbackSpeedChange = new EventEmitter<number>();

  protected readonly collapsed = signal(false);
  protected readonly accordionValue = signal<string[]>([]);
  protected readonly speedOptions = [1, 2, 3, 5] as const;

  protected get profileLabel(): string {
    if (this.profile === 'backtest') return 'SLOW SIM';
    return (this.profile || '—').toUpperCase();
  }

  protected get independent(): boolean {
    return this.selectorMode === 'independent';
  }

  protected get showPlayer(): boolean {
    return this.profile === 'backtest' && this.operating;
  }

  protected onSpeedChange(raw: string | number): void {
    const speed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(speed) || speed < 1) return;
    this.playbackSpeedChange.emit(speed);
  }

  protected get sumEquity(): number | null {
    if (!this.independent || this.strategyAccounts.length === 0) return null;
    let sum = 0;
    for (const row of this.strategyAccounts) {
      if (!this.isFiniteNum(row.account.equity)) return null;
      sum += row.account.equity;
    }
    return sum;
  }

  protected onToggle(): void {
    this.collapsed.update((v) => !v);
  }

  protected expandAll(): void {
    this.accordionValue.set(this.strategyAccounts.map((r) => r.id));
  }

  protected collapseAll(): void {
    this.accordionValue.set([]);
  }

  protected onAccordionChange(value: string | number | string[] | number[] | null | undefined): void {
    if (Array.isArray(value)) {
      this.accordionValue.set(value.map(String));
      return;
    }
    if (value == null || value === '') {
      this.accordionValue.set([]);
      return;
    }
    this.accordionValue.set([String(value)]);
  }

  protected isFiniteNum(v: unknown): boolean {
    return typeof v === 'number' && isFinite(v);
  }

  protected formatAmount(value: number): string {
    return isFinite(value) ? Math.abs(value).toFixed(2) : '—';
  }
}
