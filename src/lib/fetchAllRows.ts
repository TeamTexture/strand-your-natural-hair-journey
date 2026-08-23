// Page through a table so an admin screen never silently truncates.
//
// WHY THIS EXISTS: PostgREST caps every response at 1000 rows by default, and
// several admin screens counted rows CLIENT-SIDE from a single unpaginated
// select (or a hand-picked `.limit(500)`). Below the cap they looked perfect;
// above it they would quietly report a smaller total with no error and no
// visible sign anything was missing — the same silent-wrong-data shape as the
// directory's placeholder fallback.
//
// Any admin figure derived by counting fetched rows must page through with this
// helper. For a pure total prefer `{ count: "exact", head: true }` instead —
// that asks the database to count and never transfers rows at all.

const PAGE_SIZE = 1000;

// A guard against an accidental unbounded loop (a mis-built query that keeps
// returning full pages). 200k rows is far beyond any real admin list.
const MAX_ROWS = 200_000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Fetch every row a query matches, one page at a time.
 *
 * @param page Builds the query for a given inclusive row range. Always apply
 *             `.range(from, to)` to the query you return.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    // A short page means we've reached the end.
    if (batch.length < pageSize) break;
  }
  return all;
}
