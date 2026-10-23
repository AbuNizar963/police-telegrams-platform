import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:police_telegrams/app_lock.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/official_telegram_document.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/mobile_pages.dart' show DepartmentSettingsPage;
import 'package:police_telegrams/push_notifications.dart';
import 'package:police_telegrams/telegram_outbox.dart';

const _telegramSubject = 'وضع الحراسة اللازمة على السجين علي قوجه';

final _secureStorageForTest = <String, String>{};

void _seedExistingPin() {
  _secureStorageForTest['mobile_app_lock_pin'] = '1234';
  _secureStorageForTest['mobile_app_lock_enabled'] = 'true';
}

final _testPng = Uint8List.fromList(
  base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
  ),
);

Map<String, dynamic> _sampleTelegram() => {
  'id': 7,
  'organizationSerialCode': 'UNIT-00072',
  'serialCode': 'POL-2026-09-30-00690',
  'subject': _telegramSubject,
  'senderOrganizationName': 'قسم شرطة الشهباء',
  'recipient': 'قيادة الأمن الداخلي في محافظة حلب',
  'body': 'نص اختبار للبرقية.',
  'status': 'draft',
  'priority': 'normal',
  'classification': 'normal',
  'category': 'administrative',
  'createdAt': '2026-10-15T14:22:00.000Z',
  'verificationToken': 'test-verification-token',
  'organizationId': 'org-1',
  'currentOrganizationId': 'org-1',
  'creatorName': 'مشغل النظام',
};

void _setMobileViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pumpDashboardFrames(
  WidgetTester tester, {
  int frameCount = 6,
}) async {
  for (var frame = 0; frame < frameCount; frame++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _appLockPinField() => find.byWidgetPredicate((widget) {
  if (widget is! TextField) return false;
  final label = widget.decoration?.labelText;
  return label == 'رمز PIN (4 أرقام)' || label == 'رمز PIN السابق';
});

Future<void> _scrollIntoView(WidgetTester tester, Finder target) async {
  final scrollable = find.byType(Scrollable).first;
  await tester.scrollUntilVisible(target, 180, scrollable: scrollable);
  await tester.ensureVisible(target);
  await _pumpDashboardFrames(tester, frameCount: 3);
}

Future<void> _unlockAppIfLocked(WidgetTester tester) async {
  final setupDialog = find.text('إنشاء رمز PIN إلزامي');
  if (setupDialog.evaluate().isNotEmpty) {
    final pinFields = find.descendant(
      of: find.byType(AlertDialog),
      matching: find.byType(TextField),
    );
    expect(pinFields, findsNWidgets(2));

    await tester.enterText(pinFields.at(0), '1234');
    await tester.enterText(pinFields.at(1), '1234');
    await tester.tap(find.text('حفظ ومتابعة'));
    await _pumpDashboardFrames(tester, frameCount: 4);
  }

  final lockScreen = find.text('قم بإدخال رمز PIN');
  if (lockScreen.evaluate().isNotEmpty) {
    final pinField = _appLockPinField();
    await tester.enterText(pinField, '1234');
    await tester.pump();
    final legacyButton = find.text('التحقق من الرمز السابق');
    if (legacyButton.evaluate().isNotEmpty) {
      await tester.tap(legacyButton);
    }
    await _pumpDashboardFrames(tester, frameCount: 4);
  }

  expect(find.text('إنشاء رمز PIN إلزامي'), findsNothing);
  expect(lockScreen, findsNothing);
}

class _TestPoliceApi extends PoliceApi {
  _TestPoliceApi({
    this.signedIn = false,
    this.organizationLogoUrl,
    this.contextUnavailable = false,
    this.accountOrganizationId = 'org-1',
  });

  final bool signedIn;
  final String? organizationLogoUrl;
  final bool contextUnavailable;
  final String? accountOrganizationId;
  final calls = <String, Map<String, dynamic>?>{};
  bool logoutCalled = false;

  @override
  Future<void> logout() async {
    logoutCalled = true;
  }

  @override
  Future<Map<String, dynamic>?> restoreSession() async => signedIn
      ? {
          'id': 1,
          'name': 'مشغل النظام',
          'role': 'admin',
          if (accountOrganizationId != null)
            'organizationId': accountOrganizationId,
        }
      : null;

  @override
  Future<void> cacheDashboard({
    required Map<String, dynamic> stats,
    required List<dynamic> telegrams,
  }) async {}

  @override
  Future<Map<String, dynamic>?> readCachedDashboard() async => null;

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
  }) async {
    calls[procedure] = input;
    return switch (procedure) {
      'dashboard.stats' => {
        'total': 6,
        'incoming': 2,
        'outgoing': 4,
        'urgent': 1,
        'pending': 2,
        'resolved': 3,
        'today': 4,
        'todayUrgent': 1,
        'todayIncoming': 2,
        'inProgress': 2,
        'urgentAwaitingReceipt': 0,
      },
      'organizations.context' =>
        contextUnavailable
            ? null
            : {
                'organizationId': 'org-1',
                'organizationName': 'إدارة الاختبار',
                'role': 'organization_admin',
              },
      'organizations.logo' => {
        'organizationId': input?['organizationId'],
        'logoUrl': organizationLogoUrl,
      },
      'telegrams.list' => {
        'items': [_sampleTelegram()],
      },
      'telegrams.get' => _sampleTelegram(),
      'settings.get' => {
        'organizationId': 'org-1',
        'departmentName': 'قسم شرطة الشهباء',
        'unitName': 'قيادة الأمن الداخلي في محافظة حلب',
        'numberSystem': 'latin',
        'logoUrl': organizationLogoUrl,
      },
      'organizations.routingDirectory' => <dynamic>[],
      'notifications.inbox' => <dynamic>[],
      _ => <String, dynamic>{},
    };
  }

  @override
  Future<Uint8List?> fetchImageAsset(String source) async =>
      source == organizationLogoUrl ? _testPng : null;

  @override
  Future<Uint8List?> fetchOrganizationLogo({
    required String organizationId,
    required String source,
  }) async => organizationId == 'org-1' && source == organizationLogoUrl
      ? _testPng
      : null;
}

class _UnavailablePoliceApi extends _TestPoliceApi {
  _UnavailablePoliceApi() : super(signedIn: true);

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
  }) async {
    throw const NetworkException();
  }
}

class _EmptyTelegramOutbox extends TelegramOutbox {
  _EmptyTelegramOutbox() : super();

  @override
  Future<TelegramOutboxSyncResult> sync(PoliceApi api) async =>
      const TelegramOutboxSyncResult(synced: 0, remaining: 0, failed: 0);

  @override
  Future<int> pendingCount() async => 0;
}

class _TestOfficialTelegramDocumentRenderer
    implements OfficialTelegramDocumentRenderer {
  String? renderedHtml;

  @override
  Future<Uint8List> renderPdf(String html) async {
    renderedHtml = html;
    expect(html, contains(_telegramSubject));
    expect(html, contains('routing-qr'));
    return Uint8List.fromList([37, 80, 68, 70]);
  }

  @override
  Future<Uint8List> renderPreview(Uint8List pdfBytes) async => _testPng;

  @override
  Future<Uint8List> renderHighResolutionImage(Uint8List pdfBytes) async =>
      _testPng;
}

void main() {
  setUp(() {
    _secureStorageForTest.clear();
    AppLockRuntime.setSessionActive(false);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async {
            final arguments = call.arguments;
            final key = arguments is Map ? arguments['key'] as String? : null;
            switch (call.method) {
              case 'read':
                return key == null ? null : _secureStorageForTest[key];
              case 'write':
                if (key != null && arguments is Map) {
                  _secureStorageForTest[key] = arguments['value'] as String;
                }
                return null;
              case 'delete':
                if (key != null) _secureStorageForTest.remove(key);
                return null;
              case 'deleteAll':
                _secureStorageForTest.clear();
                return null;
              case 'readAll':
                return Map<String, String>.from(_secureStorageForTest);
              case 'containsKey':
                return key != null && _secureStorageForTest.containsKey(key);
              default:
                return null;
            }
          },
        );
  });
  test('push service construction does not require Firebase configuration', () {
    expect(PushNotificationService.new, returnsNormally);
  });

  testWidgets('department settings save the QR visibility choice', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(signedIn: true);

    await tester.pumpWidget(
      MaterialApp(home: DepartmentSettingsPage(api: api)),
    );
    await _pumpDashboardFrames(tester, frameCount: 4);

    final qrSetting = find.text('إظهار رمز QR للتحقق في البرقية');
    await _scrollIntoView(tester, qrSetting);
    final qrSwitch = find.byType(SwitchListTile);
    expect(tester.widget<SwitchListTile>(qrSwitch).value, isTrue);
    await tester.tap(qrSwitch);
    await tester.pump();
    expect(tester.widget<SwitchListTile>(qrSwitch).value, isFalse);

    final saveButton = find.text('حفظ إعدادات الجهة');
    await _scrollIntoView(tester, saveButton);
    await tester.tap(saveButton);
    await _pumpDashboardFrames(tester, frameCount: 4);

    expect(api.calls['settings.update']?['showVerificationQr'], isFalse);
  });

  testWidgets('department logo preview uses a light background', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(
      signedIn: true,
      organizationLogoUrl: 'https://images.example.test/department-logo.png',
    );

    await tester.pumpWidget(
      MaterialApp(home: DepartmentSettingsPage(api: api)),
    );
    await _pumpDashboardFrames(tester, frameCount: 5);

    expect(
      find.byWidgetPredicate(
        (widget) => widget is Image && widget.image is MemoryImage,
      ),
      findsOneWidget,
    );
    final logoTile = tester.widget<Container>(
      find.byWidgetPredicate(
        (widget) =>
            widget is Container &&
            widget.constraints?.maxWidth == 64 &&
            widget.constraints?.maxHeight == 64 &&
            widget.decoration is BoxDecoration &&
            (widget.decoration! as BoxDecoration).color == Colors.white,
      ),
    );
    expect((logoTile.decoration! as BoxDecoration).color, Colors.white);
    expect(api.calls['organizations.logo']?['organizationId'], 'org-1');
  });

  testWidgets('official telegram document keeps logo separate from watermark', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(
      signedIn: true,
      organizationLogoUrl: 'https://images.example.test/department-logo.png',
    );
    final renderer = _TestOfficialTelegramDocumentRenderer();

    await tester.pumpWidget(
      OfficialTelegramDocumentRendererScope(
        renderer: renderer,
        child: MaterialApp(
          home: OfficialTelegramDocumentPage(api: api, telegramId: 7),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 12);
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pump();

    final renderedHtml = renderer.renderedHtml!;
    expect(api.calls['organizations.logo']?['organizationId'], 'org-1');
    expect(renderedHtml, contains('class="official-logo"'));
    expect(renderedHtml, contains('class="page-watermark"'));
    expect(renderedHtml, contains('class="watermark-logo"'));
    expect(renderedHtml, contains('class="watermark-text-pattern"'));
    expect(
      renderedHtml.indexOf('class="watermark-text-pattern"'),
      lessThan(renderedHtml.indexOf('class="watermark-logo"')),
    );
    expect(renderedHtml, contains('<span>وزارة الداخلية</span>'));
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Image &&
            widget.semanticLabel == 'معاينة الوثيقة الرسمية للبرقية',
      ),
      findsOneWidget,
    );
  });

  test('mandatory app lock requires an exact four-digit PIN', () async {
    await expectLater(AppLockService.savePin('12345'), throwsFormatException);

    await AppLockService.savePin('1234');

    expect(await AppLockService.hasPin(), isTrue);
    expect(await AppLockService.isEnabled(), isTrue);
    expect(await AppLockService.hasLegacyPin(), isFalse);
    expect(_secureStorageForTest['mobile_app_lock_enabled'], 'true');
    expect(await AppLockService.isBiometricEnabled(), isFalse);
    await expectLater(
      AppLockService.setEnabled(false),
      throwsA(isA<StateError>()),
    );
  });

  testWidgets(
    'PIN lock uses four adaptive slots on the dark full-screen view',
    (tester) async {
      _setMobileViewport(tester);
      _seedExistingPin();
      AppLockRuntime.setSessionActive(true);
      addTearDown(() => AppLockRuntime.setSessionActive(false));

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.light(),
          darkTheme: ThemeData.dark(),
          themeMode: ThemeMode.dark,
          home: const AppLockOverlay(
            child: Scaffold(body: Text('protected content')),
          ),
        ),
      );
      await _pumpDashboardFrames(tester, frameCount: 8);

      expect(find.text('قم بإدخال رمز PIN'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(AppLockOverlay),
          matching: find.byType(AnimatedContainer),
        ),
        findsNWidgets(4),
      );
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is Material && widget.color == const Color(0xFF1C1D2B),
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'successful biometric unlock survives native prompt lifecycle events',
    (tester) async {
      _setMobileViewport(tester);
      const biometricChannel = MethodChannel('plugins.flutter.io/local_auth');
      final authenticationResult = Completer<Object?>();
      _seedExistingPin();
      _secureStorageForTest['mobile_app_lock_biometric'] = 'true';
      AppLockRuntime.setSessionActive(true);
      addTearDown(() => AppLockRuntime.setSessionActive(false));
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            biometricChannel,
            (call) => call.method == 'authenticate'
                ? authenticationResult.future
                : Future<Object?>.value(null),
          );
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(biometricChannel, null),
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: AppLockOverlay(
            child: Scaffold(body: Text('protected content')),
          ),
        ),
      );
      await _pumpDashboardFrames(tester, frameCount: 8);
      expect(find.text('قم بإدخال رمز PIN'), findsOneWidget);

      await tester.tap(find.byTooltip('استخدام البصمة أو التعرّف على الوجه'));
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      authenticationResult.complete(true);
      await tester.pumpAndSettle();

      // A delayed resume event from the native prompt must not relock a
      // session after biometric authentication has already succeeded.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(find.text('protected content'), findsOneWidget);
      expect(find.text('قم بإدخال رمز PIN'), findsNothing);
    },
  );

  testWidgets('first-login PIN setup requires matching entries', (
    tester,
  ) async {
    var configured = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                configured = await showMandatoryPinSetupDialog(context);
              },
              child: const Text('configure PIN'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('configure PIN'));
    await tester.pumpAndSettle();
    final pinFields = find.byType(TextField);
    expect(pinFields, findsNWidgets(2));

    await tester.enterText(pinFields.at(0), '1234');
    await tester.enterText(pinFields.at(1), '4321');
    await tester.tap(find.text('حفظ ومتابعة'));
    await tester.pump();
    expect(find.text('تأكيد الرمز غير مطابق.'), findsOneWidget);
    expect(configured, isFalse);

    await tester.enterText(pinFields.at(1), '1234');
    await tester.tap(find.text('حفظ ومتابعة'));
    await tester.pumpAndSettle();

    expect(configured, isTrue);
    expect(_secureStorageForTest['mobile_app_lock_pin'], '1234');
    expect(_secureStorageForTest['mobile_app_lock_enabled'], 'true');
  });

  testWidgets('restored session without a PIN is returned to login', (
    tester,
  ) async {
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(PoliceTelegramsApp(api: api));
    await _pumpDashboardFrames(tester, frameCount: 12);

    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.byTooltip('إنشاء برقية'), findsNothing);
    expect(api.logoutCalled, isTrue);
  });

  testWidgets('legacy PIN must be verified and replaced before unlocking', (
    tester,
  ) async {
    _secureStorageForTest['mobile_app_lock_pin'] = '123456';
    _secureStorageForTest['mobile_app_lock_enabled'] = 'false';
    AppLockRuntime.setSessionActive(true);
    addTearDown(() => AppLockRuntime.setSessionActive(false));

    await tester.pumpWidget(
      const MaterialApp(
        home: AppLockOverlay(
          child: Scaffold(body: Center(child: Text('protected content'))),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);
    expect(find.text('أدخل رمز PIN السابق'), findsOneWidget);

    await tester.enterText(_appLockPinField(), '123456');
    await tester.pump();
    await tester.tap(find.text('التحقق من الرمز السابق'));
    await tester.pumpAndSettle();
    expect(find.text('إنشاء رمز PIN إلزامي'), findsOneWidget);

    final pinFields = find.descendant(
      of: find.byType(AlertDialog),
      matching: find.byType(TextField),
    );
    await tester.enterText(pinFields.at(0), '4321');
    await tester.enterText(pinFields.at(1), '4321');
    await tester.tap(find.text('حفظ ومتابعة'));
    await tester.pumpAndSettle();

    expect(find.text('protected content'), findsOneWidget);
    expect(_secureStorageForTest['mobile_app_lock_pin'], '4321');
    expect(await AppLockService.verifyPin('123456'), isFalse);
    expect(await AppLockService.verifyPin('4321'), isTrue);
  });

  testWidgets(
    'PIN remains mandatory while biometrics are an optional setting',
    (tester) async {
      _seedExistingPin();
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: AppLockSettingsSection())),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('قفل PIN إلزامي دائمًا.'), findsOneWidget);
      expect(find.text('تفعيل قفل التطبيق'), findsNothing);
      final biometricSwitch = tester.widget<SwitchListTile>(
        find.byType(SwitchListTile),
      );
      expect(biometricSwitch.value, isFalse);
      expect(biometricSwitch.onChanged, isNotNull);
    },
  );

  testWidgets('shows police telegram login screen with Cairo typography', (
    tester,
  ) async {
    _setMobileViewport(tester);
    await tester.pumpWidget(PoliceTelegramsApp(api: _TestPoliceApi()));
    await tester.pumpAndSettle();

    expect(find.text('برقيات الشرطة'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.text('اسم المستخدم'), findsOneWidget);
    expect(
      Theme.of(tester.element(find.text('تسجيل الدخول')))
          .textTheme
          .bodyMedium
          ?.fontFamily,
      'Cairo',
    );
  });

  testWidgets(
    'dashboard matches the mobile reference and short serial format',
    (tester) async {
      _setMobileViewport(tester);
      _seedExistingPin();
      final api = _TestPoliceApi(
        signedIn: true,
        organizationLogoUrl: 'https://images.example.test/department-logo.png',
      );
      await tester.pumpWidget(PoliceTelegramsApp(api: api));
      await _pumpDashboardFrames(tester);
      await _unlockAppIfLocked(tester);

      expect(find.byTooltip('إنشاء برقية'), findsOneWidget);
      expect(find.text('تقرير البرقيات'), findsOneWidget);
      expect(find.text('تخصيص العرض'), findsOneWidget);
      expect(find.text('الفلاتر'), findsOneWidget);
      expect(find.text('الواردة اليوم'), findsOneWidget);
      expect(find.text('مرحبًا مشغل النظام'), findsNothing);
      expect(
        find.byWidgetPredicate(
          (widget) => widget is Image && widget.semanticLabel == 'شعار الجهة',
        ),
        findsOneWidget,
      );

      await _scrollIntoView(tester, find.text('برقية رقم: 72'));
      expect(find.text('برقية رقم: 72'), findsOneWidget);
      expect(find.text('برقية رقم: POL-2026-09-30-00690'), findsNothing);

      final incomingStat = find.text('الواردة اليوم');
      await tester.ensureVisible(incomingStat);
      await _pumpDashboardFrames(tester, frameCount: 3);
      await tester.tap(
        find.ancestor(of: incomingStat, matching: find.byType(InkWell)).first,
      );
      await _pumpDashboardFrames(tester, frameCount: 5);

      expect(api.calls['telegrams.list']?['direction'], 'incoming');
      expect(api.calls['telegrams.list']?['from'], isA<String>());
      expect(api.calls['telegrams.list']?['to'], isA<String>());
    },
  );

  testWidgets(
    'loads the welcome logo from the account organization when context is unavailable',
    (tester) async {
      _setMobileViewport(tester);
      _seedExistingPin();
      final api = _TestPoliceApi(
        signedIn: true,
        contextUnavailable: true,
        organizationLogoUrl: '/api/storage/department/logos/550e8400-e29b-41d4-a716-446655440000-badge.png',
      );

      await tester.pumpWidget(PoliceTelegramsApp(api: api));
      await _pumpDashboardFrames(tester);
      await _unlockAppIfLocked(tester);

      expect(api.calls['organizations.logo']?['organizationId'], 'org-1');
      expect(
        find.byWidgetPredicate(
          (widget) => widget is Image && widget.semanticLabel == 'شعار الجهة',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'loads the welcome logo from settings when context and account organization are unavailable',
    (tester) async {
      _setMobileViewport(tester);
      _seedExistingPin();
      final api = _TestPoliceApi(
        signedIn: true,
        contextUnavailable: true,
        accountOrganizationId: null,
        organizationLogoUrl: '/api/storage/department/logos/550e8400-e29b-41d4-a716-446655440000-badge.png',
      );

      await tester.pumpWidget(PoliceTelegramsApp(api: api));
      await _pumpDashboardFrames(tester);
      await _unlockAppIfLocked(tester);

      expect(api.calls['organizations.logo']?['organizationId'], 'org-1');
      expect(
        find.byWidgetPredicate(
          (widget) => widget is Image && widget.semanticLabel == 'شعار الجهة',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'shows a connection error when dashboard refresh fails without cached data',
    (tester) async {
      _setMobileViewport(tester);
      _seedExistingPin();
      await tester.pumpWidget(PoliceTelegramsApp(api: _UnavailablePoliceApi()));
      await _pumpDashboardFrames(tester, frameCount: 12);
      await _unlockAppIfLocked(tester);

      expect(find.textContaining('تعذر الاتصال بالخادم'), findsOneWidget);
      expect(find.text('وضع العمل المحلي'), findsNothing);
    },
  );

  testWidgets('keeps the empty outbox status visible after syncing', (
    tester,
  ) async {
    _setMobileViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: DashboardPage(
          api: _TestPoliceApi(signedIn: true),
          account: {'id': 1, 'name': 'مشغل النظام'},
          outbox: _EmptyTelegramOutbox(),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 12);

    // The welcome panel is the default view; status stays hidden until swiping.
    expect(find.text('الجهة الحالية'), findsOneWidget);
    expect(find.text('حالة صندوق الخروج'), findsNothing);
    expect(find.text('لا توجد برقيات معلقة محليًا.'), findsNothing);
    await tester.drag(find.text('الجهة الحالية'), const Offset(300, 0));
    await _pumpDashboardFrames(tester, frameCount: 8);

    final status = find.text('لا توجد برقيات معلقة محليًا.');
    expect(status, findsOneWidget);
    expect(find.text('حالة صندوق الخروج'), findsOneWidget);
    expect(find.textContaining('الخادم متصل • آخر تحقق'), findsOneWidget);

    await tester.pump(const Duration(seconds: 9));
    await tester.pump();

    expect(status, findsOneWidget);
    expect(find.textContaining('الخادم متصل • آخر تحقق'), findsOneWidget);

    await tester.pump(const Duration(seconds: 22));
    await tester.pump();

    expect(status, findsOneWidget);
    expect(
      find.text('جارٍ فحص صندوق الخروج وإرسال البرقيات بالترتيب...'),
      findsNothing,
    );
  });

  testWidgets('distinguishes an empty outbox from an unreachable server', (
    tester,
  ) async {
    _setMobileViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: DashboardPage(
          api: _UnavailablePoliceApi(),
          account: {'id': 1, 'name': 'مشغل النظام'},
          outbox: _EmptyTelegramOutbox(),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 12);

    // Connection and outbox status belong to the swipeable outbox card.
    expect(find.text('الجهة الحالية'), findsOneWidget);
    expect(find.text('لا توجد برقيات معلقة محليًا.'), findsNothing);
    expect(find.textContaining('الخادم غير متصل'), findsNothing);

    await tester.drag(find.text('الجهة الحالية'), const Offset(300, 0));
    await _pumpDashboardFrames(tester, frameCount: 8);

    expect(find.text('لا توجد برقيات معلقة محليًا.'), findsOneWidget);
    expect(find.textContaining('الخادم غير متصل'), findsOneWidget);
  });

  testWidgets('tapping a telegram opens the Cairo web-style document view', (
    tester,
  ) async {
    _setMobileViewport(tester);
    _seedExistingPin();
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(
      OfficialTelegramDocumentRendererScope(
        renderer: _TestOfficialTelegramDocumentRenderer(),
        child: PoliceTelegramsApp(api: api),
      ),
    );
    await _pumpDashboardFrames(tester);
    await _unlockAppIfLocked(tester);

    final serial = find.text('برقية رقم: 72');
    await _scrollIntoView(tester, serial);
    await tester.tap(serial);
    await _pumpDashboardFrames(tester, frameCount: 12);

    expect(find.byTooltip('إغلاق تفاصيل البرقية'), findsOneWidget);
    expect(find.text('72'), findsOneWidget);
    expect(find.text(_telegramSubject), findsOneWidget);
    expect(find.text('طباعة'), findsOneWidget);
    expect(find.text('إرفاق ملف'), findsOneWidget);
    expect(find.text('صورة عالية الدقة'), findsOneWidget);
    expect(find.text('PDF مطابق للطباعة'), findsOneWidget);
    expect(find.text('مشاركة صورة'), findsOneWidget);
    expect(find.text('مشاركة PDF'), findsOneWidget);
    expect(find.text('تعديل البرقية'), findsOneWidget);
    expect(find.text('الموقع'), findsOneWidget);
    expect(find.text('حذف نهائي'), findsOneWidget);
    expect(find.text('إرسال للمراجعة'), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Image &&
            widget.semanticLabel == 'معاينة الوثيقة الرسمية للبرقية',
      ),
      findsOneWidget,
    );
    expect(
      Theme.of(tester.element(find.text(_telegramSubject)))
          .textTheme
          .bodyMedium
          ?.fontFamily,
      'Cairo',
    );
    expect(api.calls['telegrams.get'], {'id': 7});
  });

  testWidgets('uses the web Lucide icon set on the home screen and drawer', (
    tester,
  ) async {
    _setMobileViewport(tester);
    _seedExistingPin();
    await tester.pumpWidget(
      PoliceTelegramsApp(api: _TestPoliceApi(signedIn: true)),
    );
    await _pumpDashboardFrames(tester);
    await _unlockAppIfLocked(tester);

    expect(find.byIcon(LucideIcons.panelLeft), findsOneWidget);
    expect(find.byIcon(LucideIcons.siren), findsOneWidget);
    final drawerButton = find.byIcon(LucideIcons.panelLeft);
    await tester.tap(drawerButton);
    await _pumpDashboardFrames(tester, frameCount: 5);

    expect(find.text('لوحة التحكم'), findsWidgets);
    for (final icon in [
      LucideIcons.layoutDashboard,
      LucideIcons.plus,
      LucideIcons.fileSpreadsheet,
      LucideIcons.mapPinned,
      LucideIcons.activity,
      LucideIcons.archive,
    ]) {
      expect(find.byIcon(icon), findsWidgets);
    }
  });
}
