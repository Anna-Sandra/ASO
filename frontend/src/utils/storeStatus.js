/** Human-readable vendor store status labels. */
export function storeStatusLabel(status) {
  switch (status) {
    case "active":
      return "Live";
    case "pending_approval":
      return "Pending approval";
    case "rejected":
      return "Rejected";
    case "suspended":
      return "Suspended";
    default:
      return "Draft";
  }
}

export function storeStatusTone(status) {
  switch (status) {
    case "active":
      return "emerald";
    case "pending_approval":
      return "amber";
    case "rejected":
      return "rose";
    default:
      return "slate";
  }
}
