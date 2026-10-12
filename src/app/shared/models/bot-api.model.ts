export type BotProfile = 'backtest' | 'paper' | 'live';
export type BotState = 'IDLE' | 'OPERATING';

export interface Warmup {
  seen: number;
  need: number;
}

export interface ConnectResponse {
  ok: boolean;
  profile: BotProfile;
  state: BotState;
  symbol: string;
  interval: string;
  initialBatch: number;
  selectorMode: string;
  warmup: Warmup;
}

export interface AccountView {
  balance: number;
  equity: number;
  unrealizedPl: number;
  commission: number;
  collateral: number;
  currency: string;
}

export interface PositionViewDto {
  strategyId: string;
  side: string;
  entryPrice: number;
  size: number;
  stopPrice: number;
  targetPrice: number;
  unrealizedPnl: number;
  barsInTrade: number;
}

export interface SessionTick {
  ts: string;
  profile: BotProfile;
  state: BotState;
  symbol: string;
  interval: string;
  initialBatch: number;
  selectorMode: string;
  warmup: Warmup;
  account: AccountView | null;
  position: PositionViewDto | null;
  strategySlotId: string | null;
}

export interface LifecycleResponse {
  ok: boolean;
  error: string | null;
  state: BotState;
  profile: BotProfile;
  evaluation: EvaluationDocument | null;
}

export interface CandleDto {
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SpecState {
  id: string;
  mode: string;
  machineState: string;
  stageIndexLong: number;
  stageIndexShort: number;
  barsInWaitLong: number;
  barsInWaitShort: number;
  barsInState: number;
  position: PositionViewDto | null;
  lastDecision: string | null;
}

export interface SpecsTick {
  ts: string;
  specs: SpecState[];
}

export interface BookEvent {
  ts: string;
  type: 'DECISION' | 'OPEN' | 'UPDATE_STOP' | 'CLOSE' | string;
  strategyId: string;
  side: string | null;
  action: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  size: number | null;
  netPnl: number | null;
  reason: string | null;
}

export interface EvaluationDocument {
  evaluation?: {
    symbol?: string;
    trials?: number;
    trainDataDir?: string;
    walkForwardDataDir?: string;
  };
  train?: SplitDocument;
  walkForward?: SplitDocument;
  comparison?: Record<string, unknown>;
  verdicts?: Record<string, { label?: string; reasons?: string[] }>;
}

export interface SplitDocument {
  run?: Record<string, unknown>;
  strategies?: StrategyReport[];
}

export interface StrategyReport {
  id: string;
  grades?: Record<string, string>;
  deflatedSharpe?: number;
  expectancyR?: number;
  profitFactor?: number;
  maxDrawdownPct?: number;
  closedTrades?: number;
  netPnl?: number;
  returnPct?: number;
  finalEquity?: number;
  stages?: {
    long?: StageRow[];
    short?: StageRow[];
    invalidated?: { long?: number; short?: number };
  };
  trades?: TradeRow[];
}

export interface StageRow {
  index?: number;
  passed?: number;
  timeouts?: number;
  fellBack?: number;
}

export interface TradeRow {
  strategyId?: string;
  side?: string;
  entryTime?: string;
  exitTime?: string;
  bars?: number;
  entryPrice?: number;
  exitPrice?: number;
  initialSize?: number;
  netPnl?: number;
  netR?: number;
  reason?: string;
}
