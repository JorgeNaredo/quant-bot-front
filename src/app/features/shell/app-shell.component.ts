import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStoreService } from '../../shared/services/session-store.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent implements OnInit {
  private readonly store = inject(SessionStoreService);
  private readonly router = inject(Router);

  protected readonly session = this.store.connect;
  protected readonly profile = computed(() => this.session()?.profile ?? '');
  protected readonly canDesk = computed(() => this.profile() !== '' && this.profile() !== 'backtest');
  protected readonly canBacktest = computed(() => this.profile() === 'backtest');
  protected readonly deskLabel = computed(() => {
    const profile = this.profile();
    if (profile === 'live') return 'Live';
    if (profile === 'paper') return 'Paper';
    return 'Paper/Live';
  });

  ngOnInit(): void {
    if (!this.session()) {
      void this.router.navigateByUrl('/');
    }
  }

  protected changeBackend(): void {
    this.store.clear();
    void this.router.navigateByUrl('/');
  }
}
