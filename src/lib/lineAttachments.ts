import { toast } from "sonner";

export interface LineAttachment {
  url: string;
  name: string;
}

/** Per-line limits for supporting documents (server enforces the size cap too). */
export const MAX_FILES_PER_LINE = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_FILES_PER_CLAIM = 40;

const ALLOWED = /^(image\/|application\/pdf$)/;

/** Merge newly picked files into a line's list, applying every limit and telling the user what was dropped. */
export function addFilesToLine(existing: File[], picked: File[], otherLinesTotal: number): File[] {
  const next = [...existing];
  const rejected: string[] = [];
  for (const f of picked) {
    if (!ALLOWED.test(f.type) && !/\.(pdf|png|jpe?g|webp|heic)$/i.test(f.name)) {
      rejected.push(`${f.name} (only images and PDFs)`);
    } else if (f.size > MAX_FILE_BYTES) {
      rejected.push(`${f.name} (over 5 MB)`);
    } else if (next.some((e) => e.name === f.name && e.size === f.size)) {
      rejected.push(`${f.name} (already added)`);
    } else if (next.length >= MAX_FILES_PER_LINE) {
      rejected.push(`${f.name} (max ${MAX_FILES_PER_LINE} files per line)`);
    } else if (otherLinesTotal + next.length >= MAX_TOTAL_FILES_PER_CLAIM) {
      rejected.push(`${f.name} (max ${MAX_TOTAL_FILES_PER_CLAIM} files per claim)`);
    } else {
      next.push(f);
    }
  }
  if (rejected.length > 0) {
    toast.error(`Not added: ${rejected.slice(0, 4).join("; ")}${rejected.length > 4 ? ` and ${rejected.length - 4} more` : ""}`, { duration: 7000 });
  }
  return next;
}

/** Saved attachments for a line, falling back to the legacy single receipt. */
export function attachmentsOf(item: {
  attachments?: LineAttachment[] | null;
  receipt_url?: string | null;
  receipt_name?: string | null;
}): LineAttachment[] {
  if (item.attachments && item.attachments.length > 0) return item.attachments;
  return item.receipt_url ? [{ url: item.receipt_url, name: item.receipt_name || "Document" }] : [];
}

/**
 * Upload every file for each created item and write back attachments plus the
 * legacy first-file receipt columns. Failures are logged and skipped per file.
 */
export async function uploadLineFiles(
  files: File[][],
  itemIds: string[],
  upload: (f: File) => Promise<LineAttachment>,
  save: (itemId: string, attachments: LineAttachment[]) => PromiseLike<unknown>,
): Promise<number> {
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    if (!files[i]?.length || !itemIds[i]) continue;
    const done: LineAttachment[] = [];
    for (const f of files[i]) {
      try {
        done.push(await upload(f));
      } catch (err) {
        failed++;
        console.error("Supporting document upload failed for line", i, err);
      }
    }
    if (done.length > 0) await save(itemIds[i], done);
  }
  return failed;
}
