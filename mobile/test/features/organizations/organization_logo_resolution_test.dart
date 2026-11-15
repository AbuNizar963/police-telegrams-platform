import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/organizations/organization_logo_resolution.dart';

void main() {
  test('uses the authenticated organization endpoint when the logo URL is empty', () {
    expect(
      resolveOrganizationLogoSourceIdentity('', (_) => 'unused'),
      'api-export',
    );
    expect(
      resolveOrganizationLogoSourceIdentity('  ', (_) => 'unused'),
      'api-export',
    );
  });

  test('uses a normalized URL identity when the logo URL exists', () {
    expect(
      resolveOrganizationLogoSourceIdentity(
        ' https://example.test/logo.png ',
        (source) => 'normalized:$source',
      ),
      'normalized:https://example.test/logo.png',
    );
    expect(
      resolveOrganizationLogoSourceIdentity('https://example.test/logo.png', (_) => ''),
      isNull,
    );
  });

  test('prefers the authenticated account organization', () {
    expect(
      resolveOrganizationLogoId(
        accountOrganizationId: ' ACTIVE-ORG ',
        currentOrganizationId: 'routed-org',
        ownerOrganizationId: 'owner-org',
      ),
      'active-org',
    );
  });

  test('falls back to telegram organization IDs when needed', () {
    expect(
      resolveOrganizationLogoId(
        accountOrganizationId: ' ',
        currentOrganizationId: 'CURRENT-ORG',
        ownerOrganizationId: 'owner-org',
      ),
      'current-org',
    );
    expect(
      resolveOrganizationLogoId(ownerOrganizationId: 'OWNER-ORG'),
      'owner-org',
    );
  });

  test('returns null when no organization identifier is available', () {
    expect(resolveOrganizationLogoId(), isNull);
  });
}
