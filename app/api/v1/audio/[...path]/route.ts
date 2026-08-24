import { readFile } from "fs/promises";
import { audioFilePath } from "../../../../../src/edition/oss/audio-store";

/**
 * Serves cached audio in the open-source edition.
 *
 * The hosted build has no route like this — its clips come from a public
 * Supabase Storage bucket through a CDN URL. Here the bytes are on the
 * operator's disk, so something has to hand them over.
 *
 * Immutable caching is safe and worth it: paths are content-addressed on
 * (text, language, voice), so a given URL can only ever mean one clip.
 */

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  try {
    const audio = await readFile(audioFilePath(path.join("/")));
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
