import { NavLink } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { isRmplOrg } from "@/lib/rmplOrg";

const tab = "px-4 py-2 rounded-full text-sm border transition-colors";

/** Switches between claim types. Redefine has three; every other org only has travel claims, so nothing shows. */
export function ClaimTypeTabs() {
  const { currentOrg } = useOrg();
  if (!isRmplOrg(currentOrg?.id)) return null;
  const items = [
    { to: "/my-expenses", label: "Travel claims" },
    { to: "/project-expenses", label: "Project expenses" },
    { to: "/field-expenses", label: "Field expenses" },
  ];
  return (
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Claim type">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          className={({ isActive }) =>
            `${tab} ${isActive ? "bg-foreground text-background border-foreground font-bold" : "bg-card text-muted-foreground hover:text-foreground"}`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </div>
  );
}
