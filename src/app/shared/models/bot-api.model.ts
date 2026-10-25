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
  /** false = vela 15m en formación (solo UI); true o ausente = cerrada del store */
  closed?: boolean;
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

export interface ReportEntry {
  name: string;
  modifiedAt: string;
}

export type EvaluationMode = 'develop' | 'confirm';

export interface EvaluationAuditRef {
  file?: string;
}

export interface EvaluationDocument {
  evaluation?: {
    symbol?: string;
    mode?: EvaluationMode | string;
    plan?: string[];
    trials?: number;
    dataDir?: string;
    isFrom?: string;
    isTo?: string;
    oosFrom?: string;
    oosTo?: string;
    holdoutFrom?: string;
    holdoutTo?: string;
    trainFrom?: string;
    trainTo?: string;
    walkForwardFrom?: string;
    walkForwardTo?: string;
    audit?: EvaluationAuditRef;
  };
  train?: SplitDocument;
  walkForward?: SplitDocument;
  /** Presente en mode=confirm (auditoría; la UI de confirmación no lo detalla). */
  oos?: SplitDocument;
  holdout?: SplitDocument;
  comparison?: ComparisonRow[];
  verdicts?: VerdictRow[];
}

export interface SplitDocument {
  run?: SplitRun;
  strategies?: StrategyReport[];
}

export interface SplitRun {
  profile?: string;
  symbol?: string;
  interval?: string;
  firstBar?: string;
  lastBar?: string;
  days?: number;
  trials?: number;
  endedBecause?: string;
  error?: string;
}

export interface ComparisonRow {
  id: string;
  trainFloor?: string;
  oosFloor?: string;
  holdoutFloor?: string;
  delta?: {
    deflatedSharpe?: number;
    expectancyR?: number;
    closedTrades?: number;
    returnPct?: number;
    maxDrawdownPct?: number;
  };
}

export interface VerdictRow {
  id: string;
  label?: string;
  reasons?: string[];
}

export interface StrategyReport {
  id: string;
  grades?: Record<string, string>;
  sampleEnough?: boolean;
  openAtEnd?: boolean;
  deflatedSharpe?: number;
  expectancyR?: number;
  profitFactor?: number;
  maxDrawdownPct?: number;
  closedTrades?: number;
  netPnl?: number;
  returnPct?: number;
  finalEquity?: number;
  winRatePct?: number;
  winners?: number;
  avgWinR?: number;
  avgLossR?: number;
  maxConsecutiveLosses?: number;
  avgBarsInTrade?: number;
  exits?: Record<string, number>;
  maxDrawdownBars?: number;
  exposurePct?: number;
  sharpePerBar?: number;
  sharpeAnnualized?: number;
  probabilisticSharpe?: number;
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

export interface ProfileRequest {
  symbols: string[];
}

export interface ProfileReport {
  symbols: SymbolOutcome[];
}

export interface SymbolOutcome {
  symbol: string;
  ok: boolean;
  error: string | null;
  summary: SymbolSummary | null;
}

export interface SymbolSummary {
  dataDir: string;
  ready: number;
  skipped: number;
  readyPct: number;
  maxHoleBars: number;
  measured: number;
  features: number;
  degenerate: string[];
  skipReasons: Record<string, number>;
  markdown: string;
  valuesCsv: string;
}

export interface SpecReachabilityResponse {
  symbols: SpecReachabilityOutcome[];
}

export interface SpecReachabilityOutcome {
  symbol: string;
  ok: boolean;
  error: string | null;
  report: SpecReachabilityReport | null;
}

export interface SpecReachabilityReport {
  symbol: string;
  barCount: number;
  firstBar: string;
  lastBar: string;
  unreachable: string[];
}
