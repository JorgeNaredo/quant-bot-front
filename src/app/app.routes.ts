import { Routes } from '@angular/router';
import { ConnectPageComponent } from './features/connect/connect-page.component';
import { AppShellComponent } from './features/shell/app-shell.component';

export const routes: Routes = [
  { path: '', component: ConnectPageComponent, pathMatch: 'full' },
  {
    path: '',
    component: AppShellComponent,
    children: [
      {
        path: 'backtest',
        loadComponent: () =>
          import('./features/backtest/backtest-page.component').then(
            (m) => m.BacktestPageComponent,
          ),
      },
      {
        path: 'desk',
        loadComponent: () =>
          import('./features/layout/components/layout-page/layout-page.component').then(
            (m) => m.LayoutPageComponent,
          ),
      },
      { path: 'live', redirectTo: 'desk', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
