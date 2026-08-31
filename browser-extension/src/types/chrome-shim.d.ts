/** Minimal Chrome extension API types for extension build without @types/chrome. */
declare namespace chrome {
  namespace runtime {
    const id: string;
    const lastError: { message?: string } | undefined;
    function sendMessage(
      extensionId: string,
      message: unknown,
      callback?: (response: unknown) => void,
    ): void;
    const onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ) => void;
    };
    const onMessageExternal: {
      addListener: (
        callback: (
          message: unknown,
          sender: { url?: string },
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ) => void;
    };
  }
  namespace tabs {
    function query(
      queryInfo: { active?: boolean; currentWindow?: boolean },
    ): Promise<Array<{ id?: number; url?: string }>>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
    function create(createProperties: { url: string }): Promise<unknown>;
  }
  namespace storage {
    const local: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  }
}
