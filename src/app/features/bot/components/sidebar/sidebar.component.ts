import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import { AccountInfo } from '../../../../shared/models/account-info.model';
import { CloseStats } from '../../../../shared/models/close-stats.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.collapsed]': 'collapsed()',
  },
})
export class SidebarComponent {
  @Input({ required: true }) connected!: boolean;
  @Input({ required: true }) accountInfo!: AccountInfo | null;
  @Input({ required: true }) closeStats!: CloseStats | null;
  @Input({ required: true }) profitLocked!: number | null;

  @Output() connect = new EventEmitter<void>();
  @Output() disconnect = new EventEmitter<void>();
  @Output() toggleCollapse = new EventEmitter<void>();

  protected readonly collapsed = signal(true);

  protected get pnlNeto(): number | null {
    if (!this.closeStats || !this.accountInfo) return null;
    return this.closeStats.totalRealizedPnl - this.accountInfo.commission;
  }

  protected onToggle(): void {
    this.collapsed.update((v) => !v);
    this.toggleCollapse.emit();
  }

  protected onAction(): void {
    if (this.connected) {
      this.disconnect.emit();
    } else {
      this.connect.emit();
    }
  }

  protected isFiniteNum(v: any): boolean {
    return typeof v === 'number' && isFinite(v);
  }

  protected formatAmount(value: number): string {
    return isFinite(value) ? Math.abs(value).toFixed(2) : '—';
  }
}
