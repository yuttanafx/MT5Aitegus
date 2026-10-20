export type Cmd = {
  id: string; ts: number; symbol: string; side: 'BUY' | 'SELL'; lot: number;
  sl?: number; tp?: number; status: 'pending' | 'sent' | 'done' | 'failed' | 'blocked';
  source: 'webhook' | 'ai'; ticket?: number; price?: number; note?: string;
};
export type Settings = { provider: 'anthropic' | 'openai' | 'google'; model: string; paused: boolean; intervalMin: number };
