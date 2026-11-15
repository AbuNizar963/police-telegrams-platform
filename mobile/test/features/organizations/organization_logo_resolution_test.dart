import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/organizations/organization_logo_resolution.dart';

void main() {
  test(
    'uses the authenticated organization endpoint when the logo URL is empty',
    () {
      expect(
        resolveOrganizationLogoSourceIdentity('', (_) => 'unused'),
        'api-export',
      );
      expect(
        resolveOrganizationLogoSourceIdentity('  ', (_) => 'unused'),
        'api-export',
      );
    },
  );

  test('uses a normalized URL identity when the logo URL exists', () {
    expect(
      resolveOrganizationLogoSourceIdentity(
        ' https://example.test/logo.png ',
        (source) => 'normalized:$source',
      ),
      'normalized:https://example.test/logo.png',
    );
    expect(
      resolveOrganizationLogoSourceIdentity(
        'https://example.test/logo.png',
        (_) => '',
      ),
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

  test('accepts only protected organization-logo storage sources', () {
    expect(
      isOfficialOrganizationLogoStorageSource(
        '/api/storage/department/logos/550e8400-e29b-41d4-a716-446655440000/logo.png',
      ),
      isTrue,
    );
    expect(
      isOfficialOrganizationLogoStorageSource(
        'https://project.supabase.co/storage/v1/object/public/telegram-files/department/logos/550e8400-e29b-41d4-a716-446655440000/logo.png',
      ),
      isTrue,
    );
    expect(
      isOfficialOrganizationLogoStorageSource(
        'https://police.example.test/api/storage/department/logos/org-1/logo.png',
      ),
      isTrue,
    );
    expect(
      isOfficialOrganizationLogoStorageSource(
        'https://project.supabase.co/storage/v1/object/sign/telegram-files/department/logos/logo.png?token=temporary',
      ),
      isTrue,
    );
    expect(
      isOfficialOrganizationLogoStorageSource('data:image/png;base64,AA=='),
      isFalse,
    );
    expect(
      isOfficialOrganizationLogoStorageSource('file:///tmp/logo.png'),
      isFalse,
    );
    expect(
      isOfficialOrganizationLogoStorageSource('https://example.test/logo.png'),
      isFalse,
    );
  });

}
