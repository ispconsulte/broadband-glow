const isBrowser = () => typeof window !== "undefined";
const memoryStore = new Map<string, string>();

function getBrowserStorage() {
  if (!isBrowser()) return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clearCachedEntries() {
  const browserStorage = getBrowserStorage();
  if (browserStorage) {
    for (let i = browserStorage.length - 1; i >= 0; i -= 1) {
      const currentKey = browserStorage.key(i);
      if (currentKey?.startsWith("cache:")) browserStorage.removeItem(currentKey);
    }
  }

  for (const currentKey of Array.from(memoryStore.keys())) {
    if (currentKey.startsWith("cache:")) {
      memoryStore.delete(currentKey);
    }
  }
}

function readRaw(key: string): string | null {
  const browserStorage = getBrowserStorage();
  if (browserStorage) {
    const persisted = browserStorage.getItem(key);
    if (persisted !== null) {
      memoryStore.set(key, persisted);
      return persisted;
    }
  }

  return memoryStore.get(key) ?? null;
}

function writeRaw(key: string, value: string) {
  const browserStorage = getBrowserStorage();
  if (browserStorage) {
    browserStorage.setItem(key, value);
  }
  memoryStore.set(key, value);
}

function removeRaw(key: string) {
  const browserStorage = getBrowserStorage();
  if (browserStorage) {
    browserStorage.removeItem(key);
  }
  memoryStore.delete(key);
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = readRaw(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch (error) {
      console.error(`Erro ao ler storage em memória (${key}):`, error);
      return fallback;
    }
  },

  set<T>(key: string, value: T) {
    try {
      writeRaw(key, JSON.stringify(value));
    } catch (error) {
      const isQuotaError =
        error instanceof DOMException &&
        (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");

      if (isQuotaError && key.startsWith("cache:")) {
        clearCachedEntries();
        try {
          writeRaw(key, JSON.stringify(value));
          return;
        } catch (retryError) {
          console.error(`Erro ao salvar storage em memória (${key}) após limpar cache:`, retryError);
          return;
        }
      }

      console.error(`Erro ao salvar storage em memória (${key}):`, error);
    }
  },

  remove(key: string) {
    try {
      removeRaw(key);
    } catch (error) {
      console.error(`Erro ao remover storage em memória (${key}):`, error);
    }
  },

  keys(prefix = "") {
    const browserStorage = getBrowserStorage();
    const persistedKeys = browserStorage
      ? Array.from({ length: browserStorage.length }, (_, index) => browserStorage.key(index)).filter((key): key is string => Boolean(key))
      : [];

    return Array.from(new Set([...persistedKeys, ...memoryStore.keys()])).filter((key) => key.startsWith(prefix));
  },
};

export const supabaseMemoryStorage = {
  getItem(key: string) {
    return isBrowser() ? readRaw(key) : null;
  },
  setItem(key: string, value: string) {
    if (!isBrowser()) return;
    writeRaw(key, value);
  },
  removeItem(key: string) {
    if (!isBrowser()) return;
    removeRaw(key);
  },
};
