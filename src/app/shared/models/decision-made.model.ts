export interface TradingDecision {
  action: 'BUY' | 'SELL' | 'CLOSE' | 'UPDATE_SL' | 'WAIT';
  symbol: string | null;
  quantity: number;
  limitPrice: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  reason: string;
}

export interface DecisionMade {
  symbol: string;
  decision: TradingDecision;
  timestamp: number;
}