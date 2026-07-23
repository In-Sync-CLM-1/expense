import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRmplProjects } from "@/hooks/useAdvanceRequests";

interface RmplProjectComboboxProps {
  value: string | null;
  valueName?: string | null;
  onChange: (projectId: string, projectName: string) => void;
  disabled?: boolean;
}

// Project list is read live from RMPL (a separate Supabase project) via
// the list-rmpl-projects edge function, filtered to projects currently
// in execution — RMPL owns this data, Expense never creates or edits one.
export function RmplProjectCombobox({ value, valueName, onChange, disabled }: RmplProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: projects = [], isLoading, isError } = useRmplProjects(open);

  const filtered = projects.filter((p) => p.project_name.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedName = projects.find((p) => p.id === value)?.project_name || valueName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" disabled={disabled} className={cn("w-full justify-between font-normal", !selectedName && "text-muted-foreground")}>
          <span className="truncate">{selectedName || "Assign to project…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search RMPL projects in execution…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <CommandEmpty>Could not load projects from RMPL.</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No matching project in execution.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => { onChange(p.id, p.project_name); setSearch(""); setOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                      {p.project_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
