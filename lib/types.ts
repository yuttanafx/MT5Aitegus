export type Cmd = {
  id: string; ts: number; symbol: string; side: 'BUY' | 'SELL'; lot: number;
  sl?: number; tp?: number; status: 'pending' | 'sent' | 'done' | 'failed' | 'blocked';
  source: 'webhook' | 'ai'; ticket?: number; price?: number; note?: string;
};
export type Settings = { provider: 'anthropic' | 'openai' | 'google'; model: string; paused: boolean; intervalMin: number; map: Record<string, string[]>; gridProfiles: Record<string, import('./profiles').Profile>; gridMap: Record<string, string> };
export type User = { id: string; name: string; hash: string; createdAt: number; lastSeen?: number };
