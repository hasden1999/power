/**
 * src/types/sqlite-wasm.d.ts
 * Type definitions for @sqlite.org/sqlite-wasm
 */

declare module '@sqlite.org/sqlite-wasm' {
  export interface Sqlite3Static {
    version: {
      libVersion: string;
      libVersionNumber: number;
      sourceId: string;
    };
    oo1: {
      DB: new (filename?: string, mode?: string) => any;
      OpfsDb: new (filename: string, mode?: string) => any;
    };
    opfs?: {
      getDir: () => Promise<FileSystemDirectoryHandle>;
      entryExists: (filename: string) => Promise<boolean>;
      deleteEntry: (filename: string) => Promise<boolean>;
    };
    wasm: {
      alloc: (bytes: number) => number;
      dealloc: (ptr: number) => void;
    };
  }

  export interface InitOptions {
    print?: (...args: any[]) => void;
    printErr?: (...args: any[]) => void;
    locateFile?: (file: string, prefix?: string) => string;
  }

  export default function sqlite3InitModule(options?: InitOptions): Promise<Sqlite3Static>;
}
