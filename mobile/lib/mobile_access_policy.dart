const _telegramReportRoles = <String>{
  'system_admin',
  'organization_admin',
  'regional_admin',
  'organization_supervisor',
  'reviewer',
  'reader',
  'auditor',
};

const _organizationUserManagementRoles = <String>{
  'system_admin',
  'organization_admin',
  'regional_admin',
  'organization_supervisor',
};

const _organizationSettingsRoles = <String>{
  'system_admin',
  'organization_admin',
};

bool hasMobileTelegramReportAccess({
  required String? accountRole,
  required String? organizationRole,
  required bool isPlatformOwner,
}) {
  return accountRole == 'admin' ||
      isPlatformOwner ||
      _telegramReportRoles.contains(organizationRole);
}

bool hasMobileUserManagementAccess({
  required String? accountRole,
  required String? organizationRole,
  required bool isPlatformOwner,
}) {
  return accountRole == 'admin' ||
      isPlatformOwner ||
      _organizationUserManagementRoles.contains(organizationRole);
}

bool hasMobileOrganizationSettingsAccess({
  required String? organizationRole,
  required bool isPlatformOwner,
}) {
  return isPlatformOwner ||
      _organizationSettingsRoles.contains(organizationRole);
}
