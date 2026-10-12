import { Routes } from '@angular/router';
import { ConnectPageComponent } from './features/connect/connect-page.component';
import { BacktestPageComponent } from './features/backtest/backtest-page.component';
import { LayoutPageComponent } from './features/layout/components/layout-page/layout-page.component';

export const routes: Routes = [
  { path: '', component: ConnectPageComponent },
  { path: 'backtest', component: BacktestPageComponent },
  { path: 'live', component: LayoutPageComponent },
  { path: '**', redirectTo: '' },
];
