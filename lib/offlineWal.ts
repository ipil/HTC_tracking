export const OFFLINE_WAL_KEY = "htc-write-ahead-log-v1";

export type WalEntry = {
  path: string;
  body: any;
  timestamp: number;
};

export type WalStore = Record<string, WalEntry>;

export function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures such as Safari private mode or quota errors.
  }
}

export function loadWal(): WalStore {
  try {
    const parsed = safeJsonParse<WalStore>(localStorage.getItem(OFFLINE_WAL_KEY));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveWal(wal: WalStore): void {
  safeSetLocalStorage(OFFLINE_WAL_KEY, JSON.stringify(wal));
}

export function walUpsert(wal: WalStore, path: string, body: any): WalStore {
  return {
    ...wal,
    [path]: {
      path,
      body,
      timestamp: Date.now()
    }
  };
}

export function walRemove(wal: WalStore, path: string): WalStore {
  const next = { ...wal };
  delete next[path];
  return next;
}
