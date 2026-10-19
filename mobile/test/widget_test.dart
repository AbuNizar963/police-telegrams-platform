import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/official_telegram_document.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/push_notifications.dart';
import 'package:police_telegrams/telegram_outbox.dart';

const _telegramSubject = 'وضع الحراسة اللازمة على السجين علي قوجه';
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

Future<void> _scrollIntoView(WidgetTester tester, Finder target) async {
  final scrollable = find.byType(Scrollable).first;
  await tester.scrollUntilVisible(target, 180, scrollable: scrollable);
  await tester.ensureVisible(target);
  await _pumpDashboardFrames(tester, frameCount: 3);
}

class _TestPoliceApi extends PoliceApi {
  _TestPoliceApi({this.signedIn = false});

  final bool signedIn;
  final calls = <String, Map<String, dynamic>?>{};

  @override
  Future<Map<String, dynamic>?> restoreSession() async =>
      signedIn ? {'id': 1, 'name': 'مشغل النظام', 'role': 'admin'} : null;

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
      'organizations.context' => {
        'organizationId': 'org-1',
        'organizationName': 'إدارة الاختبار',
        'role': 'organization_admin',
      },
      'telegrams.list' => {
        'items': [_sampleTelegram()],
      },
      'telegrams.get' => _sampleTelegram(),
      'settings.get' => {
        'departmentName': 'قسم شرطة الشهباء',
        'unitName': 'قيادة الأمن الداخلي في محافظة حلب',
        'numberSystem': 'latin',
        'logoUrl': null,
      },
      'organizations.routingDirectory' => <dynamic>[],
      'notifications.inbox' => <dynamic>[],
      _ => <String, dynamic>{},
    };
  }
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
  @override
  Future<Uint8List> renderPdf(String html) async {
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
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async {
            switch (call.method) {
              case 'read':
                return null;
              case 'readAll':
                return <String, String>{};
              case 'containsKey':
                return false;
              default:
                return null;
            }
          },
        );
  });
  test('push service construction does not require Firebase configuration', () {
    expect(PushNotificationService.new, returnsNormally);
  });

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
      final api = _TestPoliceApi(signedIn: true);
      await tester.pumpWidget(PoliceTelegramsApp(api: api));
      await _pumpDashboardFrames(tester);

      expect(find.byTooltip('إنشاء برقية'), findsOneWidget);
      expect(find.text('تقرير البرقيات'), findsOneWidget);
      expect(find.text('تخصيص العرض'), findsOneWidget);
      expect(find.text('الفلاتر'), findsOneWidget);
      expect(find.text('الواردة اليوم'), findsOneWidget);
      expect(find.text('مرحبًا مشغل النظام'), findsNothing);

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
    'shows a connection error when dashboard refresh fails without cached data',
    (tester) async {
      _setMobileViewport(tester);
      await tester.pumpWidget(PoliceTelegramsApp(api: _UnavailablePoliceApi()));
      await _pumpDashboardFrames(tester, frameCount: 12);

      expect(find.text('تعذر الاتصال بالخادم'), findsOneWidget);
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

    expect(find.text('لا توجد برقيات معلقة محليًا.'), findsOneWidget);
    expect(find.textContaining('الخادم غير متصل'), findsOneWidget);
  });

  testWidgets('tapping a telegram opens the Cairo web-style document view', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(
      OfficialTelegramDocumentRendererScope(
        renderer: _TestOfficialTelegramDocumentRenderer(),
        child: PoliceTelegramsApp(api: api),
      ),
    );
    await _pumpDashboardFrames(tester);

    final serial = find.text('برقية رقم: 72');
    await _scrollIntoView(tester, serial);
    await tester.tap(serial);
    await _pumpDashboardFrames(tester, frameCount: 5);

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
    await tester.pumpWidget(
      PoliceTelegramsApp(api: _TestPoliceApi(signedIn: true)),
    );
    await _pumpDashboardFrames(tester);

    expect(find.byIcon(LucideIcons.panelLeft), findsOneWidget);
    expect(find.byIcon(LucideIcons.siren), findsOneWidget);
    await tester.tap(find.byTooltip('فتح القائمة الجانبية'));
    await _pumpDashboardFrames(tester, frameCount: 5);

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
