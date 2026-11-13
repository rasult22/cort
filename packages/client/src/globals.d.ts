// Shared by the web and mobile clients; these are the only platform globals it uses.
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;
