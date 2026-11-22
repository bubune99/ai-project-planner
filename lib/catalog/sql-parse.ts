/*
 * SQL reading for the catalog scanner. Pure text in, plain data out.
 *
 * Two jobs:
 *   - migrations: which tables and columns exist after a list of migration
 *     files is applied in order (CREATE TABLE, ALTER TABLE ADD/DROP COLUMN,
 *     DROP TABLE);
 *   - queries: which tables one SQL statement reads and which it writes.
 *
 * Not a SQL parser. It knows enough to get past what real migrations in this
 * repo contain: comments with semicolons and apostrophes, strings holding
 * SQL, checks that run over several lines, one-line tables, schema prefixes.
 */

// ============================================================================
// Text helpers
// ============================================================================

/** Remove `-- line` and block comments, leaving strings alone. A line comment keeps its line break. */
export function stripSqlComments(sql: string): string {
  let out = ""
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (ch === "'") {
      const end = endOfString(sql, i)
      out += sql.slice(i, end)
      i = end
    } else if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++
    } else if (ch === "/" && next === "*") {
      const close = sql.indexOf("*/", i + 2)
      i = close === -1 ? sql.length : close + 2
      out += " "
    } else {
      out += ch
      i++
    }
  }
  return out
}

/** Index just past the single-quoted string that starts at `start` ('' is an escaped quote). */
function endOfString(text: string, start: number): number {
  let i = start + 1
  while (i < text.length) {
    if (text[i] === "'") {
      if (text[i + 1] === "'") i += 2
      else return i + 1
    } else i++
  }
  return text.length
}

/** Same text, same length, with the inside of every string blanked: safe to search for statements. */
export function maskSqlStrings(sql: string): string {
  let out = ""
  let i = 0
  while (i < sql.length) {
    if (sql[i] === "'") {
      const end = endOfString(sql, i)
      out += "'" + " ".repeat(Math.max(0, end - i - 2)) + (end - i >= 2 ? "'" : "")
      i = end
    } else {
      out += sql[i]
      i++
    }
  }
  return out
}

/** Index of the `)` matching the `(` at `open` in string-masked text, or -1. */
function matchingParen(masked: string, open: number): number {
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === "(") depth++
    else if (masked[i] === ")") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Split on commas that are not inside parentheses or strings. */
export function splitTopLevel(text: string): string[] {
  const masked = maskSqlStrings(text)
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i]
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(from, i))
      from = i + 1
    }
  }
  parts.push(text.slice(from))
  return parts.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)
}

const bareName = (qualified: string): string => qualified.split(".").pop()!.replace(/"/g, "")

// ============================================================================
// Migrations
// ============================================================================

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default?: string
  check?: string
  references?: string
}

export interface TableInfo {
  name: string
  /** The migration that created it. */
  file: string
  columns: Array<ColumnInfo & { file: string }>
  primaryKey: string[]
  constraints: string[]
}

export interface MigrationSchema {
  tables: TableInfo[]
  /** Columns added to a table that none of the given files creates (a targeted scan of a later migration). */
  looseColumns: Array<ColumnInfo & { file: string; table: string }>
}

const NAME = String.raw`(?:"?\w+"?\.)?"?\w+"?`
const TYPE_RE = new RegExp(
  "^(" +
    [
      String.raw`double\s+precision`,
      String.raw`(?:character|bit)\s+varying(?:\s*\(\s*\d+\s*\))?`,
      String.raw`(?:timestamp|time)(?:\s*\(\s*\d+\s*\))?\s+with(?:out)?\s+time\s+zone`,
      String.raw`"?[\w.]+"?(?:\s*\(\s*[\d,\s]+\s*\))?`,
    ].join("|") +
    String.raw`)((?:\s*\[\s*\d*\s*\])*)`,
  "i",
)
const NOT_A_COLUMN = /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE|LIKE|INDEX)\b/i

/** One item of a CREATE TABLE body or an ADD COLUMN clause, already on one line. Null when it is not a column. */
export function parseColumn(item: string): ColumnInfo | null {
  if (NOT_A_COLUMN.test(item)) return null
  const m = item.match(/^"?(\w+)"?\s+(.+)$/)
  if (!m) return null
  const rest = m[2]
  const t = rest.match(TYPE_RE)
  if (!t) return null
  const type = (t[1] + (t[2] ?? "")).toUpperCase().replace(/\s*([()\[\],])\s*/g, "$1").replace(/\s+/g, " ").trim()
  const masked = maskSqlStrings(rest)

  const column: ColumnInfo = {
    name: m[1],
    type,
    nullable: !/\bNOT\s+NULL\b/i.test(masked) && !/\bPRIMARY\s+KEY\b/i.test(masked),
  }
  const def = masked.match(/\bDEFAULT\s+/i)
  if (def && def.index !== undefined) {
    const from = def.index + def[0].length
    const stop = masked.slice(from).search(/\s+(?:NOT\s+NULL|NULL|CHECK|REFERENCES|PRIMARY|UNIQUE|CONSTRAINT|GENERATED|COLLATE)\b/i)
    column.default = rest.slice(from, stop === -1 ? undefined : from + stop).trim()
  }
  const check = masked.match(/\bCHECK\s*\(/i)
  if (check && check.index !== undefined) {
    const open = check.index + check[0].length - 1
    const close = matchingParen(masked, open)
    if (close !== -1) column.check = rest.slice(open + 1, close).trim()
  }
  const ref = masked.match(/\bREFERENCES\s+((?:"?\w+"?\.)?"?\w+"?)\s*(?:\(\s*"?(\w+)"?\s*\))?/i)
  if (ref) column.references = `${bareName(ref[1])}${ref[2] ? `.${ref[2]}` : ""}`
  return column
}

/**
 * The schema left by applying `files` in the order given. Callers pass
 * migrations sorted by name. A column defined twice keeps its first
 * definition; a dropped table or column is gone unless created again later.
 */
export function readMigrations(files: ReadonlyArray<{ file: string; sql: string }>): MigrationSchema {
  const tables = new Map<string, TableInfo>()
  const loose = new Map<string, ColumnInfo & { file: string; table: string }>()

  for (const { file, sql } of files) {
    const code = stripSqlComments(sql)
    const masked = maskSqlStrings(code)

    // Statements in the order they appear, so a drop after a create (or the reverse) lands right.
    const statementRe = new RegExp(
      String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${NAME})\s*\(` +
        String.raw`|\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${NAME})\s+` +
        String.raw`|\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]+)`,
      "gi",
    )
    let m: RegExpExecArray | null
    while ((m = statementRe.exec(masked)) !== null) {
      if (m[1] !== undefined) {
        const open = m.index + m[0].length - 1
        const close = matchingParen(masked, open)
        if (close === -1) continue
        statementRe.lastIndex = close
        const name = bareName(m[1])
        if (tables.has(name)) continue
        const table: TableInfo = { name, file, columns: [], primaryKey: [], constraints: [] }
        for (const item of splitTopLevel(code.slice(open + 1, close))) {
          const column = parseColumn(item)
          if (column) {
            if (!table.columns.some((c) => c.name === column.name)) table.columns.push({ ...column, file })
            continue
          }
          table.constraints.push(item)
          const pk = item.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i)
          if (pk) table.primaryKey.push(...pk[1].split(",").map((c) => c.trim().replace(/"/g, "")))
        }
        for (const c of table.columns) loose.delete(`${name}.${c.name}`)
        tables.set(name, table)
      } else if (m[2] !== undefined) {
        const from = m.index + m[0].length
        const end = masked.indexOf(";", from)
        const stop = end === -1 ? masked.length : end
        statementRe.lastIndex = stop
        const name = bareName(m[2])
        for (const action of splitTopLevel(code.slice(from, stop))) {
          const add = action.match(/^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(.+)$/i)
          const drop = action.match(/^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?"?(\w+)"?(?:\s+(?:CASCADE|RESTRICT))?$/i)
          const table = tables.get(name)
          if (add) {
            const column = parseColumn(add[1])
            if (!column) continue
            if (table) {
              if (!table.columns.some((c) => c.name === column.name)) table.columns.push({ ...column, file })
            } else if (!loose.has(`${name}.${column.name}`)) {
              loose.set(`${name}.${column.name}`, { ...column, file, table: name })
            }
          } else if (drop && !/^DROP\s+CONSTRAINT\b/i.test(action)) {
            if (table) table.columns = table.columns.filter((c) => c.name !== drop[1])
            loose.delete(`${name}.${drop[1]}`)
          }
        }
      } else if (m[3] !== undefined) {
        for (const part of m[3].split(",")) {
          const dropped = part.trim().match(new RegExp(`^(${NAME})`))
          if (!dropped) continue
          const name = bareName(dropped[1])
          tables.delete(name)
          for (const key of [...loose.keys()]) if (key.startsWith(`${name}.`)) loose.delete(key)
        }
      }
    }
  }

  return { tables: [...tables.values()], looseColumns: [...loose.values()] }
}

// ============================================================================
// Queries
// ============================================================================

export interface SqlAccess {
  reads: string[]
  writes: string[]
}

const NOT_A_TABLE = new Set(["select", "lateral", "only", "unnest", "values", "set", "where", "on", "and", "or", "not", "as"])

/**
 * Tables one statement (or fragment) reads and writes. Dynamic parts of a
 * template should already be replaced by a placeholder that is not a word.
 * Names are returned as written; a name nobody created simply matches no table.
 */
export function sqlAccess(sqlText: string): SqlAccess {
  let text = maskSqlStrings(stripSqlComments(sqlText))
  // FROM that is not a table source.
  text = text
    .replace(/\bIS\s+(?:NOT\s+)?DISTINCT\s+FROM\b/gi, " ")
    .replace(/\b(EXTRACT|SUBSTRING|TRIM|OVERLAY|POSITION)\s*\(([^()]*?)\bFROM\b/gi, "$1($2 ")

  const cteNames = new Set<string>()
  for (const m of text.matchAll(/(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)"?(\w+)"?\s*(?:\([^()]*\)\s*)?AS\s+(?:(?:NOT\s+)?MATERIALIZED\s+)?\(/gi)) {
    cteNames.add(m[1].toLowerCase())
  }

  const writes = new Set<string>()
  const reads = new Set<string>()
  const isTable = (name: string, after: string): boolean =>
    !NOT_A_TABLE.has(name.toLowerCase()) && !cteNames.has(name.toLowerCase()) && !/^\s*[.(]/.test(after)

  for (const m of text.matchAll(/\bINSERT\s+INTO\s+"?(\w+)"?/gi)) writes.add(m[1])
  for (const m of text.matchAll(/\bUPDATE\s+(?:ONLY\s+)?"?(\w+)"?\s+(?:AS\s+\w+\s+|(?!SET\b)\w+\s+)?SET\b/gi)) {
    if (m[1].toLowerCase() !== "set") writes.add(m[1])
  }
  for (const m of text.matchAll(/\bDELETE\s+FROM\s+(?:ONLY\s+)?"?(\w+)"?/gi)) writes.add(m[1])
  for (const m of text.matchAll(/\b(DELETE\s+)?(?:FROM|JOIN)\s+(?:ONLY\s+|LATERAL\s+)?"?([A-Za-z_]\w*)"?/gi)) {
    if (m[1]) continue
    const after = text.slice((m.index ?? 0) + m[0].length)
    if (isTable(m[2], after)) reads.add(m[2])
  }
  for (const name of cteNames) {
    for (const w of [...writes]) if (w.toLowerCase() === name) writes.delete(w)
  }
  return { reads: [...reads].sort(), writes: [...writes].sort() }
}
