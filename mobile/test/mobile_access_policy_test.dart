import 'package:flutter_test/flutter_test.dart';

import 'package:police_telegrams/mobile_access_policy.dart';

void main() {
  group('hasMobileTelegramReportAccess', () {
    const allowedOrganizationRoles = <String>[
      'system_admin',
      'organization_admin',
      'regional_admin',
      'organization_supervisor',
      'reviewer',
      'reader',
      'auditor',
    ];

    for (final role in allowedOrganizationRoles) {
      test('allows report role $role', () {
        expect(
          hasMobileTelegramReportAccess(
            accountRole: 'user',
            organizationRole: role,
            isPlatformOwner: false,
          ),
          isTrue,
        );
      });
    }

    test('allows platform admins and platform owners', () {
      expect(
        hasMobileTelegramReportAccess(
          accountRole: 'admin',
          organizationRole: null,
          isPlatformOwner: false,
        ),
        isTrue,
      );
      expect(
        hasMobileTelegramReportAccess(
          accountRole: 'user',
          organizationRole: null,
          isPlatformOwner: true,
        ),
        isTrue,
      );
    });

    test('denies roles not allowed by reports.telegrams', () {
      for (final role in ['dispatcher', 'unknown']) {
        expect(
          hasMobileTelegramReportAccess(
            accountRole: 'user',
            organizationRole: role,
            isPlatformOwner: false,
          ),
          isFalse,
        );
      }
    });
  });

  group('hasMobileUserManagementAccess', () {
    const allowedOrganizationRoles = <String>[
      'system_admin',
      'organization_admin',
      'regional_admin',
      'organization_supervisor',
    ];

    for (final role in allowedOrganizationRoles) {
      test('allows scoped management role $role', () {
        expect(
          hasMobileUserManagementAccess(
            accountRole: 'user',
            organizationRole: role,
            isPlatformOwner: false,
          ),
          isTrue,
        );
      });
    }

    test('allows global admins and platform owners', () {
      expect(
        hasMobileUserManagementAccess(
          accountRole: 'admin',
          organizationRole: null,
          isPlatformOwner: false,
        ),
        isTrue,
      );
      expect(
        hasMobileUserManagementAccess(
          accountRole: 'user',
          organizationRole: null,
          isPlatformOwner: true,
        ),
        isTrue,
      );
    });

    test('denies report-only and operational roles', () {
      for (final role in ['reviewer', 'reader', 'auditor', 'dispatcher']) {
        expect(
          hasMobileUserManagementAccess(
            accountRole: 'user',
            organizationRole: role,
            isPlatformOwner: false,
          ),
          isFalse,
        );
      }
    });
  });

  group('hasMobileOrganizationSettingsAccess', () {
    test('allows organization administrators and platform owners', () {
      for (final role in ['system_admin', 'organization_admin']) {
        expect(
          hasMobileOrganizationSettingsAccess(
            organizationRole: role,
            isPlatformOwner: false,
          ),
          isTrue,
        );
      }
      expect(
        hasMobileOrganizationSettingsAccess(
          organizationRole: null,
          isPlatformOwner: true,
        ),
        isTrue,
      );
    });

    test('does not equate a global admin role with platform ownership', () {
      expect(
        hasMobileOrganizationSettingsAccess(
          organizationRole: null,
          isPlatformOwner: false,
        ),
        isFalse,
      );
    });

    test('denies non-administrator organization roles', () {
      for (final role in [
        'regional_admin',
        'organization_supervisor',
        'reviewer',
        'reader',
        'auditor',
        'dispatcher',
      ]) {
        expect(
          hasMobileOrganizationSettingsAccess(
            organizationRole: role,
            isPlatformOwner: false,
          ),
          isFalse,
        );
      }
    });
  });
}
