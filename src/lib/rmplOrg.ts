// The "REDEFINE MARCOM PRIVATE LIMITED" org — the only tenant the
// Project Expense claim type is built for (RMPL's own "Outing
// Activity" sheet format). There's also a stray lowercase-named
// duplicate org in this database; this id is the real 100+-employee
// tenant, not the duplicate.
export const RMPL_ORG_ID = "c5f6b811-b6a9-4165-8125-3d4dc6b5bf9a";

export function isRmplOrg(orgId: string | null | undefined): boolean {
  return orgId === RMPL_ORG_ID;
}
