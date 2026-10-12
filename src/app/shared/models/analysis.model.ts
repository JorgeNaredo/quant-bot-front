export type TradeAction = 'LONG' | 'SHORT' | 'HOLD';
export type SignalType = 'PULLBACK' | 'BREAKOUT' | 'TREND' | 'MEAN_REVERSION' | 'NONE';
export type TrendStrength = 'NONE' | 'WEAK' | 'MODERATE' | 'STRONG';
export type Conviction = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type MarketHealth = 'HEALTHY' | 'WARNING' | 'EXHAUSTED';
export type MarketBias = 'STRONG_LONG' | 'LONG' | 'NEUTRAL_LONG' | 'NEUTRAL' | 'NEUTRAL_SHORT' | 'SHORT' | 'STRONG_SHORT';
export type MarketDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type VolatilityState = 'CONTRACTING' | 'NORMAL' | 'EXPANDING';

export interface Regime {
  strength: TrendStrength;
  direction: MarketDirection;
  persistence: number;
  volatility: VolatilityState;
  health: MarketHealth;
}

export interface PriceAnalysis {
  id: string;
  occurredAt: string;
  symbol: string;
  timeframe: string;
  action: TradeAction;
  bias: MarketBias;
  signal: SignalType;
  strength: TrendStrength;
  conviction: Conviction;
  health: MarketHealth;
  invalidations: string[];
  regime: Regime;
}