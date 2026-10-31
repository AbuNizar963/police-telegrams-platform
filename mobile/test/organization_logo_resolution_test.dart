import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/organization_logo_resolution.dart';

void main() {
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
