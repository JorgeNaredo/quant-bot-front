import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import { AccountInfo } from '../../../../shared/models/account-info.model';

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
  @Input({ required: true }) operating!: boolean;
  @Input({ required: true }) accountInfo!: AccountInfo | null;
  @Input({ required: true }) profitLocked!: number | null;
  @Input() profile = '';
  @Input() symbol = '';
  @Input() busy = false;
  @Input() error: string | null = null;

  @Output() startBot = new EventEmitter<void>();
  @Output() stopBot = new EventEmitter<void>();
  @Output() changeBackend = new EventEmitter<void>();

  protected readonly collapsed = signal(false);

  protected onToggle(): void {
    this.collapsed.update((v) => !v);
  }

  protected isFiniteNum(v: unknown): boolean {
    return typeof v === 'number' && isFinite(v);
  }

  protected formatAmount(value: number): string {
    return isFinite(value) ? Math.abs(value).toFixed(2) : '—';
  }
}
