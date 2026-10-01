import { useRef } from "react";
import { ExternalLink, FileText, Paperclip, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { addFilesToLine, MAX_FILES_PER_LINE, type LineAttachment } from "@/lib/lineAttachments";

interface Props {
  files: File[];
  otherLinesTotal: number;
  onChange: (files: File[]) => void;
}

/** Paperclip button with a count badge; opens a small list to add/remove several files. */
export function LineAttachmentsPicker({ files, otherLinesTotal, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={files.length ? files.map((f) => f.name).join(", ") : "Attach supporting documents"}
          className={`relative h-8 w-8 flex items-center justify-center rounded border hover:bg-muted ${files.length ? "border-primary text-primary" : "text-muted-foreground"}`}
        >
          <Paperclip className="h-3.5 w-3.5" />
          {files.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 text-center">
              {files.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          Up to {MAX_FILES_PER_LINE} files per line · images or PDF · 5 MB each
        </p>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs border rounded px-2 py-1">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
                <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))} aria-label={`Remove ${f.name}`}>
                  <X className="h-3.5 w-3.5 text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={inputRef} type="file" multiple accept="image/*,.pdf" className="hidden"
          onChange={(e) => {
            onChange(addFilesToLine(files, Array.from(e.target.files ?? []), otherLinesTotal));
            e.target.value = "";
          }}
        />
        <Button
          type="button" variant="outline" size="sm" className="w-full"
          disabled={files.length >= MAX_FILES_PER_LINE}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5 mr-2" /> {files.length ? "Add more files" : "Choose files"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Read-only links for saved attachments. */
export function AttachmentLinks({ items }: { items: LineAttachment[] }) {
  if (items.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 ml-2 align-middle">
      {items.map((a, i) => (
        <a
          key={`${a.url}-${i}`} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}
          className="text-blue-500 inline-flex items-center gap-0.5 text-xs max-w-[140px]"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{items.length > 1 ? a.name : ""}</span>
        </a>
      ))}
    </span>
  );
}
