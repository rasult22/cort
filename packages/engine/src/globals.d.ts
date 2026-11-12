// The engine runs in browsers and in Node; these are the only platform globals it uses.
declare function structuredClone<T>(value: T): T;
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;
