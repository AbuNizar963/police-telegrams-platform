type SnapshotRecord = Record<string, unknown>;

function asRecord(value: unknown): SnapshotRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as SnapshotRecord)
    : null;
}

/**
 * Resolve the immutable letterhead that belongs to the latest official
 * issuance. Content edits must not silently replace the historical signer
 * with whoever currently leads the organization. A reissue is the only event
 * that establishes a new issuance identity.
 */
export function getIssuedLetterheadForContentEdit(
  versions: Array<{ snapshot: SnapshotRecord }>,
  organizationId: string
): SnapshotRecord | null {
  const latestReissue = [...versions].reverse().find(version => {
    const issuance = asRecord(asRecord(version.snapshot)?.issuance);
    return issuance?.type === "reissue";
  });
  const issuanceAnchor = latestReissue ?? versions[0];
  const letterhead = asRecord(issuanceAnchor?.snapshot?.letterhead);

  if (
    !letterhead ||
    typeof letterhead.organizationId !== "string" ||
    letterhead.organizationId.toLowerCase() !== organizationId.toLowerCase()
  ) {
    return null;
  }

  return { ...letterhead };
}
