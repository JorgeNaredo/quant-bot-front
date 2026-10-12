export interface CloseStats {
  stopLossCount: number;
  takeProfitCount: number;
  winCount: number;
  lossCount: number;
  totalRealizedPnl: number;
  totalWinPnl: number;
  totalLossPnl: number;
  liquidationCount: number;
}
