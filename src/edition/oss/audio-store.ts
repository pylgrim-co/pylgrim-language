import { mkdir, stat, writeFile } from "fs/promises";
import { dirname, join, resolve, sep } from "path";

/**
 * Audio persistence on the local filesystem.
 *
 * The hosted edition puts clips in a public Supabase Storage bucket and
 * hands out CDN URLs. There is no bucket here, so clips live under
 * .pylgrim-cache/audio/ and are served back by /api/v1/audio/*.
 *
 * Cache discipline is identical either way — generate once per (content,
 * voice), serve forever — because the path is content-addressed upstream
 * in src/lib/server/tts.ts. Deleting the directory is a safe reset; it
 * costs one re-synthesis per phrase.
 */

const ROOT = join(process.cwd(), ".pylgrim-cache", "audio");

/**
 * Paths come from clipPath()/narrationPath(), which build them from a
 * sha256 hash and a sanitised voice id. This re-checks anyway: the value
 * reaches the serving route from the URL, and a store that trusts its
 * input is one traversal away from serving arbitrary files.
 */
function safeJoin(path: string): string {
  const full = resolve(ROOT, path);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    throw new Error(`audio path escapes the cache directory: ${path}`);
  }
  return full;
}

export async function audioExists(path: string): Promise<boolean> {
  try {
    return (await stat(safeJoin(path))).isFile();
  } catch {
    return false;
  }
}

export async function uploadAudio(path: string, audio: Buffer): Promise<void> {
  const full = safeJoin(path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, audio);
}

/** Same-origin path served by app/api/v1/audio/[...path]/route.ts. */
export function audioUrl(path: string): string {
  return `/api/v1/audio/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Where the serving route reads from. Not part of the hosted seam. */
export function audioFilePath(path: string): string {
  return safeJoin(path);
}
