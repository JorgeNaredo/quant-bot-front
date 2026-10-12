export interface ExecutionReport {
  type: 'ORDER_ACCEPTED' | 'ORDER_FILLED' | 'ORDER_CANCELLED' | 'ORDER_EXPIRED' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT' | 'STOP_LOSS_UPDATED' | 'LIQUIDATED' | 'POSITION_CLOSED';
  symbol: string;
  side: 'BUY' | 'SELL';
  orderId: string;
  price: number;
  filledQuantity: number;
  stopLoss: number;
  takeProfit: number;
  entryPrice: number;
  commission: number;
  balance: number;
  timestamp: number;
}
