// Coordinates the PWA's auto-update reload with the New Expense Claim
// dialog. The service worker checks for a new deploy every 60s AND on every
// tab-focus regain (workbox-window's built-in behavior) — firing a forced
// page reload within seconds of switching back to this tab, even mid-fill,
// wiping the open dialog. Restoring the draft on reload isn't enough to fix
// this reliably (the reload itself races the tab regaining focus), so the
// actual fix is to never reload out from under someone with the dialog open:
// defer the reload until they close or submit it.
let claimDialogOpen = false;
let pendingUpdate: (() => void) | null = null;

export function setClaimDialogOpen(open: boolean) {
  claimDialogOpen = open;
  if (!open && pendingUpdate) {
    const run = pendingUpdate;
    pendingUpdate = null;
    run();
  }
}

export function requestAppUpdate(applyUpdate: () => void) {
  if (claimDialogOpen) {
    pendingUpdate = applyUpdate;
  } else {
    applyUpdate();
  }
}
