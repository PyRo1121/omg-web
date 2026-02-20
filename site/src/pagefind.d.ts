declare module "/pagefind/pagefind.js" {
  export interface PagefindResult {
    id: string;
    url: string;
    excerpt: string;
    meta: Record<string, string>;
    sub_results?: PagefindSubResult[];
  }

  export interface PagefindSubResult {
    title: string;
    url: string;
    excerpt: string;
  }

  export interface PagefindSearchResults {
    results: { id: string; data: () => Promise<PagefindResult> }[];
    unfilteredResultCount: number;
    filters: Record<string, Record<string, number>>;
    totalFilters: Record<string, Record<string, number>>;
    timings: { preload: number; search: number; total: number };
  }

  export function init(): Promise<void>;
  export function search(query: string, options?: Record<string, unknown>): Promise<PagefindSearchResults>;
  export function debouncedSearch(query: string, options?: Record<string, unknown>): Promise<PagefindSearchResults | null>;
  export function preload(query: string): Promise<void>;
}
