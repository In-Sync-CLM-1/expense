import { useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { useProjectExpenseClaimDetail } from "@/hooks/useProjectExpenses";
import type { ExpenseClaim } from "@/hooks/useExpenseClaims";

export interface SupportFile {
  url: string;
  name?: string | null;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)(\?|#|$)/i;
const isImage = (f: SupportFile) => IMAGE_RE.test(f.name ?? "") || IMAGE_RE.test(f.url);

function Thumb({ file }: { file: SupportFile }) {
  const [broken, setBroken] = useState(false);
  const label = file.name || "Supporting file";
  if (isImage(file) && !broken) {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label} (opens full size)`}
        className="block rounded-lg border bg-muted overflow-hidden hover:ring-2 hover:ring-primary"
      >
        <img
          src={file.url}
          alt={label}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-28 w-28 object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="h-28 w-28 rounded-lg border bg-muted flex flex-col items-center justify-center gap-1.5 p-2 text-center hover:ring-2 hover:ring-primary"
    >
      <FileText className="h-7 w-7 text-primary" aria-hidden="true" />
      <span className="text-xs break-words [overflow-wrap:anywhere] line-clamp-2">{label}</span>
    </a>
  );
}

/** Always-visible row of uploaded supporting files. Images show as thumbnails, everything else as a file tile. */
export function FileStrip({ files, emptyText = "No receipt uploaded" }: { files: SupportFile[]; emptyText?: string | null }) {
  if (files.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {emptyText}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => <Thumb key={`${f.url}-${i}`} file={f} />)}
    </div>
  );
}

export function receiptFiles(item: { receipt_url?: string | null; receipt_name?: string | null }): SupportFile[] {
  return item.receipt_url ? [{ url: item.receipt_url, name: item.receipt_name }] : [];
}

/** Every supporting file on a travel claim: claim-level proofs plus each line's receipt. */
export function TravelClaimFiles({ claim }: { claim: ExpenseClaim }) {
  const proofs = (claim.proof_urls ?? []).map((p) => ({ url: p.url, name: p.name }));
  const lines = (claim.items ?? []).filter((i) => i.receipt_url);
  return (
    <div className="space-y-3">
      {proofs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Claim proofs</p>
          <FileStrip files={proofs} />
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">Receipts</p>
        <FileStrip
          files={lines.flatMap((i) => receiptFiles(i))}
          emptyText={proofs.length > 0 ? null : "No receipts uploaded on this claim"}
        />
      </div>
    </div>
  );
}

/** Every supporting file on a project claim (loads the lines itself). */
export function ProjectClaimFiles({ claimId }: { claimId: string }) {
  const { data: detail, isLoading } = useProjectExpenseClaimDetail(claimId);
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading receipts…</p>;
  const lines = detail?.items ?? [];
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Receipts</p>
      <FileStrip
        files={lines.flatMap((i) => receiptFiles(i))}
        emptyText="No receipts uploaded on this claim"
      />
      {lines.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {lines.filter((i) => i.receipt_url).length} of {lines.length} lines have a receipt
        </p>
      )}
    </div>
  );
}
