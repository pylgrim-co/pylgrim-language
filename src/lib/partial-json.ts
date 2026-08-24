/**
 * Incremental extraction of completed segment objects from a streaming JSON
 * buffer, so the reader sees content well inside the five-second budget
 * while the full story is still generating.
 *
 * The generated story shape is { title_l1, title_target, segments: [...] }.
 * We scan for the segments array, then brace-match complete top-level
 * objects inside it, string- and escape-aware. Each completed object is
 * JSON.parsed individually; a malformed one stops extraction (the full
 * document validation at the end is the real gate).
 */

export interface PartialExtract<T> {
  items: T[];
  /** index into the buffer up to which segments have been consumed */
  consumedTo: number;
}

export function extractArrayObjects<T>(buffer: string, arrayKey: string, from = 0): PartialExtract<T> {
  const items: T[] = [];
  let consumedTo = from;

  let arrayStart: number;
  if (from > 0) {
    arrayStart = from; // continuing inside a previously located array
  } else {
    const keyIdx = buffer.indexOf(`"${arrayKey}"`);
    if (keyIdx === -1) return { items, consumedTo: 0 };
    const bracket = buffer.indexOf("[", keyIdx);
    if (bracket === -1) return { items, consumedTo: 0 };
    arrayStart = bracket + 1;
  }

  let i = arrayStart;
  while (i < buffer.length) {
    // Skip whitespace and commas between elements.
    while (i < buffer.length && /[\s,]/.test(buffer[i])) i++;
    if (i >= buffer.length || buffer[i] === "]") break;
    if (buffer[i] !== "{") break; // unexpected shape; stop, final parse will judge

    // Brace-match one object, aware of strings and escapes.
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = i; j < buffer.length; j++) {
      const ch = buffer[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break; // object incomplete — wait for more buffer

    try {
      items.push(JSON.parse(buffer.slice(i, end + 1)) as T);
    } catch {
      break;
    }
    i = end + 1;
    consumedTo = i;
  }

  return { items, consumedTo: consumedTo || arrayStart };
}
