import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/** Execute actual route/service source with explicit offline SDK boundaries. */
export function loadSource<T>(file: string, mocks: Record<string, unknown>): T {
  const cache = new Map<string, { exports: unknown }>();
  const nativeRequire = createRequire(import.meta.url);
  function load(path: string): unknown {
    path = resolve(path);
    if (cache.has(path)) return cache.get(path)!.exports;
    const sourceModule = { exports: {} as unknown };
    cache.set(path, sourceModule);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = (id: string): unknown => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'server-only') return {};
      if (id.startsWith('@/')) return load(resolve('src', id.slice(2)) + '.ts');
      if (id.startsWith('.')) return load(resolve(dirname(path), id) + '.ts');
      return nativeRequire(id);
    };
    runInNewContext(source, { module: sourceModule, exports: sourceModule.exports, require, process, console,
      Request, Response, Headers, FormData, File, Blob, TextEncoder, Date, URL, Buffer, AbortSignal,
      fetch: mocks.__fetch ?? (() => { throw new Error('Network disabled in source tests'); }), setTimeout, clearTimeout });
    return sourceModule.exports;
  }
  return load(file) as T;
}

export type Row = Record<string, unknown>;
export function mockDb(tables: Record<string, Row[]>, rpc: (name: string, args: Row) => unknown) {
  return {
    auth: { getUser: async (token: string) => ({ data: { user: token === 'valid' ? { id: USER_A, email: 'owner@example.test' } : null }, error: null }) },
    rpc: async (name: string, args: Row): Promise<{data: unknown;error: {code?:string;message?:string} | null}> => ({ data: rpc(name, args), error: null }),
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      let mutation: { kind: 'insert' | 'update' | 'delete'; value?: Row } | undefined;
      let maximum: number | undefined;
      const result = () => {
        const rows = tables[table] ??= [];
        let matching = rows.filter(row => filters.every(f => f(row)));
        if (mutation?.kind === 'insert') { matching = [{ ...mutation.value, id: 'saved' }]; rows.push(...matching); }
        if (mutation?.kind === 'update') matching.forEach(row => Object.assign(row, mutation?.value));
        if (mutation?.kind === 'delete') tables[table] = rows.filter(row => !matching.includes(row));
        if (maximum !== undefined) matching = matching.slice(0, maximum);
        return { data: matching, count: matching.length, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
        order: () => query,
        limit: (n: number) => { maximum = n; return query; },
        insert: (value: Row) => { mutation = { kind: 'insert', value }; return query; },
        update: (value: Row) => { mutation = { kind: 'update', value }; return query; },
        delete: () => { mutation = { kind: 'delete' }; return query; },
        single: async () => { const r = result(); return { ...r, data: r.data[0] ?? null, error: r.data.length === 1 ? null : { code: 'PGRST116' } }; },
        maybeSingle: async () => { const r = result(); return { ...r, data: r.data[0] ?? null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
}
export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const RECORDING = '33333333-3333-4333-8333-333333333333';
export const SESSION = '44444444-4444-4444-8444-444444444444';
export const QUESTION = '55555555-5555-4555-8555-555555555555';
