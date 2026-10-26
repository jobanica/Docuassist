/**
 * Read every row a query matches, instead of just the first page.
 *
 * PostgREST returns at most `max-rows` rows — 1000 on Supabase — however many
 * actually match, and says nothing about the ones it left behind. A page built
 * on a single select therefore stops growing at a thousand and still looks
 * complete: the orders board read "1000 of 1000 orders" while the 34 oldest
 * jobs had quietly fallen off the end of it. Nothing errors, nothing warns,
 * and the number even looks reassuringly round.
 *
 * So: walk the pages until we hold everything the server counted.
 *
 * Callers must ask for `{ count: "exact" }` and must sort on something unique
 * (append the id to the sort). Without a stable order the database is free to
 * return rows in a different arrangement per page, which quietly duplicates
 * some and drops others across a page boundary.
 */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>,
  pageSize = 1000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  let total: number | null = null;
  // Tracked separately from rows.length so the walk is still correct if a
  // caller's filter means the two ever diverge.
  let from = 0;

  for (;;) {
    const { data, error, count } = await page(from, from + pageSize - 1);
    if (error) return { data: rows, error };

    const batch = data ?? [];
    rows.push(...batch);
    if (count !== null && count !== undefined) total = count;

    // Advance by what actually came back, not by what we asked for: a server
    // whose max-rows is below our page size hands back a short page every
    // time, and stepping by pageSize would stride straight over the rows it
    // did not have room for.
    from += batch.length;

    // An empty page means there is nothing further to read, whatever the
    // count claims — without this the loop would spin against the database.
    if (batch.length === 0) break;
    // Done when we hold everything the server counted. A short page is the
    // fallback for a caller that did not ask for an exact count.
    if (total !== null ? rows.length >= total : batch.length < pageSize) break;
  }

  return { data: rows, error: null };
}
