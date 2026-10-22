import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { BookEvent, SpecState } from '../../../../shared/models/bot-api.model';
import { BookStreamService } from '../../../../shared/services/book-stream.service';
import { SpecsStreamService } from '../../../../shared/services/specs-stream.service';

interface OrderRow {
  id: string;
  strategyId: string;
  side: string;
  status: string;
  price: number;
  size: number;
  stop?: number | null;
  target?: number | null;
  pnl?: number | null;
}

@Component({
  selector: 'app-dashboard-panel',
  standalone: true,
  imports: [DecimalPipe, TableModule, TagModule],
  templateUrl: './dashboard-panel.component.html',
  styleUrl: './dashboard-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPanelComponent implements OnDestroy {
  readonly connected = input(false);

  private readonly specsStream = inject(SpecsStreamService);
  private readonly bookStream = inject(BookStreamService);

  protected readonly specs = signal<SpecState[]>([]);
  protected readonly decisions = signal<BookEvent[]>([]);
  protected readonly activeOrders = signal<OrderRow[]>([]);
  protected readonly closedOrders = signal<OrderRow[]>([]);

  private specsSub: Subscription | null = null;
  private bookSub: Subscription | null = null;
  private readonly openByStrategy = new Map<string, OrderRow>();

  constructor() {
    effect(() => {
      if (this.connected()) {
        this.startListening();
      } else {
        this.clearAll();
      }
    });
  }

  ngOnDestroy(): void {
    this.specsSub?.unsubscribe();
    this.bookSub?.unsubscribe();
  }

  protected stateSeverity(machineState: string | null | undefined): 'success' | 'danger' | 'warn' | 'secondary' {
    switch (machineState) {
      case 'ARMED_LONG':
        return 'success';
      case 'ARMED_SHORT':
        return 'danger';
      case 'ARMED_BOTH':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  protected sideSeverity(side: string | null | undefined): 'success' | 'danger' | 'secondary' {
    if (side === 'BUY' || side === 'LONG') return 'success';
    if (side === 'SELL' || side === 'SHORT') return 'danger';
    return 'secondary';
  }

  protected actionSeverity(action: string | null | undefined): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    if (!action) return 'secondary';
    if (action === 'ENTER_LONG') return 'success';
    if (action === 'ENTER_SHORT' || action === 'closeAll') return 'danger';
    if (action === 'closePartial') return 'warn';
    if (action.startsWith('move') || action === 'activateTrailing') return 'info';
    return 'secondary';
  }

  protected actionLabel(action: string | null | undefined): string {
    if (!action) return '—';
    switch (action) {
      case 'NADA': return 'NADA';
      case 'ENTER_LONG': return 'ENTER LONG';
      case 'ENTER_SHORT': return 'ENTER SHORT';
      case 'activateTrailing': return 'TRAILING';
      case 'moveStopTo': return 'MOVE STOP';
      case 'moveStopToBreakeven': return 'BREAKEVEN';
      case 'closeAll': return 'CLOSE ALL';
      case 'closePartial': return 'CLOSE PART';
      case 'moveTarget': return 'MOVE TP';
      default: return action;
    }
  }

  protected formatTime(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return ts;
    }
  }

  private startListening(): void {
    this.specsSub?.unsubscribe();
    this.bookSub?.unsubscribe();
    this.specsSub = this.specsStream.specs$.subscribe((tick) => {
      this.specs.set(tick.specs ?? []);
    });
    this.bookSub = this.bookStream.events$.subscribe((event) => this.onBook(event));
  }

  private onBook(event: BookEvent): void {
    if (event.type === 'DECISION') {
      this.decisions.update((list) => [event, ...list].slice(0, 80));
      return;
    }
    if (event.type === 'OPEN') {
      const row: OrderRow = {
        id: `${event.strategyId}-${event.ts}`,
        strategyId: event.strategyId,
        side: event.side ?? '—',
        status: 'OPEN',
        price: event.entryPrice ?? 0,
        size: event.size ?? 0,
        stop: event.stopPrice,
        target: event.targetPrice,
      };
      this.openByStrategy.set(event.strategyId, row);
      this.activeOrders.set(Array.from(this.openByStrategy.values()));
      return;
    }
    if (event.type === 'UPDATE_STOP') {
      const current = this.openByStrategy.get(event.strategyId);
      if (current) {
        current.stop = event.stopPrice;
        this.openByStrategy.set(event.strategyId, { ...current });
        this.activeOrders.set(Array.from(this.openByStrategy.values()));
      }
      return;
    }
    if (event.type === 'CLOSE') {
      const closed: OrderRow = {
        id: `${event.strategyId}-${event.ts}-close`,
        strategyId: event.strategyId,
        side: event.side ?? '—',
        status: event.reason ?? 'CLOSE',
        price: event.exitPrice ?? 0,
        size: event.size ?? 0,
        pnl: event.netPnl,
      };
      this.openByStrategy.delete(event.strategyId);
      this.activeOrders.set(Array.from(this.openByStrategy.values()));
      this.closedOrders.update((list) => [closed, ...list].slice(0, 80));
    }
  }

  private clearAll(): void {
    this.specsSub?.unsubscribe();
    this.bookSub?.unsubscribe();
    this.specs.set([]);
    this.decisions.set([]);
    this.activeOrders.set([]);
    this.closedOrders.set([]);
    this.openByStrategy.clear();
  }
}
