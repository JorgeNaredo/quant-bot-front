import { AccountInfo } from './account-info.model';
import { PositionViewDto } from './bot-api.model';

/** Mini-cuenta de una estrategia para el sidebar en modo independent. */
export interface StrategyAccountRow {
  id: string;
  shortId: string;
  account: AccountInfo;
  position: PositionViewDto | null;
  profitLocked: number | null;
}
