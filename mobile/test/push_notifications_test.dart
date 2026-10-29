import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/push_notifications.dart';

void main() {
  test('registers the same device token again when the active organization changes', () async {
    final registration = OrganizationPushTokenRegistration();
    final registeredTokens = <String>[];

    Future<bool> isEnabled() async => true;
    Future<String?> currentToken() async => 'device-token';
    Future<bool> registerToken(String token) async {
      registeredTokens.add(token);
      return true;
    }

    await registration.ensureRegistered(
      organizationId: 'organization-a',
      notificationsEnabled: isEnabled,
      currentToken: currentToken,
      registerToken: registerToken,
    );
    await registration.ensureRegistered(
      organizationId: 'organization-a',
      notificationsEnabled: isEnabled,
      currentToken: currentToken,
      registerToken: registerToken,
    );
    await registration.ensureRegistered(
      organizationId: 'organization-b',
      notificationsEnabled: isEnabled,
      currentToken: currentToken,
      registerToken: registerToken,
    );

    expect(registeredTokens, ['device-token', 'device-token']);
    expect(registration.registeredOrganizationId, 'organization-b');
  });

  test('retries registration after the server rejects a token update', () async {
    final registration = OrganizationPushTokenRegistration();
    var attempts = 0;
    var shouldSucceed = false;

    Future<bool> registerToken(String token) async {
      attempts++;
      return shouldSucceed;
    }

    Future<bool> isEnabled() async => true;
    Future<String?> currentToken() async => 'device-token';

    await registration.ensureRegistered(
      organizationId: 'organization-a',
      notificationsEnabled: isEnabled,
      currentToken: currentToken,
      registerToken: registerToken,
    );
    expect(registration.registeredOrganizationId, isNull);

    shouldSucceed = true;
    await registration.ensureRegistered(
      organizationId: 'organization-a',
      notificationsEnabled: isEnabled,
      currentToken: currentToken,
      registerToken: registerToken,
    );

    expect(attempts, 2);
    expect(registration.registeredOrganizationId, 'organization-a');
  });

  test('processes a newer organization requested while registration is in flight', () async {
    final registration = OrganizationPushTokenRegistration();
    final firstRegistration = Completer<bool>();
    final registeredTokens = <String>[];

    Future<bool> registerToken(String token) {
      registeredTokens.add(token);
      if (registeredTokens.length == 1) return firstRegistration.future;
      return Future<bool>.value(true);
    }

    Future<bool> isEnabled() async => true;
    Future<String?> currentToken() async => 'device-token';

    final firstSync = registration.ensureRegistered(
      organizationId: 'organization-a',
      notificationsEnabled: isEnabled,
      currentToken: currentToken,
      registerToken: registerToken,
    );
    await Future<void>.delayed(Duration.zero);
    await registration.ensureRegistered(
      organizationId: 'organization-b',
      notificationsEnabled: isEnabled,
      currentToken: currentToken,
      registerToken: registerToken,
    );
    firstRegistration.complete(true);
    await firstSync;

    expect(registeredTokens, ['device-token', 'device-token']);
    expect(registration.registeredOrganizationId, 'organization-b');
  });
}
