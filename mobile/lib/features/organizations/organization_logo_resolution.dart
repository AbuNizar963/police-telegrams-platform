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

/// Produces a cache identity even when settings omit a direct logo URL.
///
/// In that case the authenticated binary endpoint can still resolve the
/// active organization's logo using its ID.
String? resolveOrganizationLogoSourceIdentity(
  String? source,
  String Function(String) cacheIdentity,
) {
  final value = source?.trim() ?? '';
  if (value.isEmpty) return 'api-export';
  final identity = cacheIdentity(value);
  return identity.isEmpty ? null : identity;
}

/// Accepts only the protected application storage route or a Supabase object
/// URL that can be resolved by the server's configured storage bucket.
///
/// This is an early client-side guard only; the export endpoint independently
/// validates the URL, object key, image signature, and organization ownership.
bool isOfficialOrganizationLogoStorageSource(String? source) {
  final value = source?.trim() ?? '';
  if (value.isEmpty) return false;
  if (value.startsWith('/api/storage/')) return true;

  return RegExp(
    r'/storage/v1/object/(?:sign|public|authenticated)/[^/]+/department/logos/',
    caseSensitive: false,
  ).hasMatch(value);
}
