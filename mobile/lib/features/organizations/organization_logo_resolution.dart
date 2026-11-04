/// Resolves the organization whose letterhead belongs on an exported document.
///
/// The authenticated account's active organization takes precedence, matching
/// the web export behavior. Telegram routing/owner IDs are legacy fallbacks.
String? resolveOrganizationLogoId({
  Object? accountOrganizationId,
  Object? currentOrganizationId,
  Object? ownerOrganizationId,
}) {
  for (final candidate in [
    accountOrganizationId,
    currentOrganizationId,
    ownerOrganizationId,
  ]) {
    final value = candidate?.toString().trim();
    if (value != null && value.isNotEmpty) return value.toLowerCase();
  }
  return null;
}
