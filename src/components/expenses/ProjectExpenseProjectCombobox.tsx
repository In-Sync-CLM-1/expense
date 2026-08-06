import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRmplProjectsForExpense, type RmplProjectOption } from "@/hooks/useProjectExpenses";

interface ProjectExpenseProjectComboboxProps {
  value: string | null;
  valueName?: string | null;
  onChange: (project: RmplProjectOption) => void;
  disabled?: boolean;
}

// Same live RMPL project list used for Advance Requests, extended with
// project_number + the resolved Project Owner — this is what auto-fills
// the header fields and decides who approves the claim.
export function ProjectExpenseProjectCombobox({ value, valueName, onChange, disabled }: ProjectExpenseProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: projects = [], isLoading, isError } = useRmplProjectsForExpense(open);

  const filtered = projects.filter((p) => p.project_name.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = projects.find((p) => p.id === value);
  const selectedName = selected?.project_name || valueName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" disabled={disabled} className={cn("w-full justify-between font-normal", !selectedName && "text-muted-foreground")}>
          <span className="truncate">{selectedName || "Select RMPL project…"}</span>
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
                      onSelect={() => { onChange(p); setSearch(""); setOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                      <span className="flex flex-col">
                        <span>{p.project_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.project_number ?? "No project #"} · Owner: {p.project_owner_name ?? "—"}
                        </span>
                      </span>
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
