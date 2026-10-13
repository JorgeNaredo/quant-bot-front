export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** false = forming; true/undefined = closed bar from store */
  closed?: boolean;
}
