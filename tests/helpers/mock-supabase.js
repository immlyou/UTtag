/**
 * Mock Supabase client for unit/integration tests.
 *
 * createMockSupabase(tables)
 *   tables: { table_name: [...rows] }
 *
 * Supports the chained query builder pattern used throughout the codebase:
 *   .from(table).select(...).eq(col, val).single()
 *   .from(table).select(...).in(col, vals)
 *   .from(table).insert({...})
 *   .from(table).update({...}).eq(col, val)
 *   .from(table).upsert({...})
 *
 * Mocked behaviour (document at test top level too):
 *   - .select() returns a shallow copy of the rows array for the table.
 *   - .eq(col, val) filters rows where row[col] === val (string-coerced for safety).
 *   - .in(col, vals) filters rows where vals includes row[col].
 *   - .gte(col, val) filters rows where row[col] >= val (string comparison — sufficient for ISO dates).
 *   - .single() returns { data: firstMatch | null, error: null }.
 *   - .insert() / .update() / .upsert() record the call and resolve { data: null, error: null }.
 *   - .order() and .limit() are no-ops that preserve the current result set (order matters for real DB
 *     but tests supply pre-ordered data anyway).
 *   - chained .select() after .from() on a join expression (e.g. "*, clients(...)") is treated as "*".
 *
 * NOT supported: complex PostgREST operators (ilike, contains, etc.), RLS, transactions.
 */

function createMockSupabase(tables = {}) {
  // Deep-clone tables so mutations in one test don't affect others
  const store = {};
  for (const [name, rows] of Object.entries(tables)) {
    store[name] = rows.map(r => ({ ...r }));
  }

  // Track all write calls so tests can assert on them
  const calls = { insert: [], update: [], upsert: [] };

  function buildQuery(tableName) {
    let rows = (store[tableName] || []).map(r => ({ ...r }));
    let selectCols = null; // null = all

    const q = {
      select(cols) {
        selectCols = cols; // stored but not used for column filtering — tests use full rows
        return q;
      },
      eq(col, val) {
        rows = rows.filter(r => String(r[col]) === String(val));
        return q;
      },
      neq(col, val) {
        rows = rows.filter(r => String(r[col]) !== String(val));
        return q;
      },
      in(col, vals) {
        rows = rows.filter(r => vals.includes(r[col]));
        return q;
      },
      gte(col, val) {
        rows = rows.filter(r => r[col] >= val);
        return q;
      },
      lte(col, val) {
        rows = rows.filter(r => r[col] <= val);
        return q;
      },
      order() { return q; },
      limit(n) { rows = rows.slice(0, n); return q; },
      single() {
        const data = rows.length > 0 ? rows[0] : null;
        return Promise.resolve({ data, error: null });
      },
      // Resolve as array result
      then(resolve) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
      // Support await on the query builder directly
      [Symbol.toStringTag]: "MockQuery",
    };

    // Make the query thenable so `await supabase.from(...).select(...)` works
    Object.defineProperty(q, Symbol.toStringTag, { value: "MockQuery" });

    return q;
  }

  return {
    _store: store,
    _calls: calls,
    from(tableName) {
      const q = buildQuery(tableName);

      // Attach write methods that capture the table context
      q.insert = function(data) {
        calls.insert.push({ table: tableName, data });
        const arr = Array.isArray(data) ? data : [data];
        arr.forEach(row => store[tableName] && store[tableName].push({ ...row }));
        return Promise.resolve({ data: null, error: null });
      };

      q.update = function(patch) {
        calls.update.push({ table: tableName, patch });
        // Return a chainable that applies the patch after .eq()
        let filterCol, filterVal;
        const upd = {
          eq(col, val) {
            filterCol = col; filterVal = val;
            if (store[tableName]) {
              store[tableName].forEach(row => {
                if (String(row[filterCol]) === String(filterVal)) {
                  Object.assign(row, patch);
                }
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return upd;
      };

      q.upsert = function(data) {
        calls.upsert.push({ table: tableName, data });
        return Promise.resolve({ data: null, error: null });
      };

      return q;
    },
  };
}

module.exports = { createMockSupabase };
