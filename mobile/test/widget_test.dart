import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/push_notifications.dart';

const _telegramSubject = 'وضع الحراسة اللازمة على السجين علي قوجه';

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

Future<void> _scrollIntoView(WidgetTester tester, Finder target) async {
  final scrollable = find
      .ancestor(of: target, matching: find.byType(Scrollable))
      .first;
  await tester.scrollUntilVisible(target, 180, scrollable: scrollable);
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
}

class _TestPoliceApi extends PoliceApi {
  _TestPoliceApi({this.signedIn = false});

  final bool signedIn;
  final calls = <String, Map<String, dynamic>?>{};

  @override
  Future<Map<String, dynamic>?> restoreSession() async =>
      signedIn ? {'id': 1, 'name': 'مشغل النظام', 'role': 'admin'} : null;

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

void main() {
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
      await tester.pumpAndSettle();

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
      await tester.pumpAndSettle();
      await tester.tap(
        find.ancestor(of: incomingStat, matching: find.byType(InkWell)).first,
      );
      await tester.pumpAndSettle();

      expect(api.calls['telegrams.list']?['direction'], 'incoming');
      expect(api.calls['telegrams.list']?['from'], isA<String>());
      expect(api.calls['telegrams.list']?['to'], isA<String>());
    },
  );

  testWidgets('tapping a telegram opens the Cairo web-style document view', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(PoliceTelegramsApp(api: api));
    await tester.pumpAndSettle();

    final serial = find.text('برقية رقم: 72');
    await _scrollIntoView(tester, serial);
    await tester.tap(serial);
    await tester.pumpAndSettle();

    expect(find.byTooltip('إغلاق تفاصيل البرقية'), findsOneWidget);
    expect(find.text('72'), findsOneWidget);
    expect(find.text(_telegramSubject), findsOneWidget);
    expect(find.text('طباعة'), findsOneWidget);
    expect(find.text('إرفاق ملف'), findsOneWidget);
    expect(find.text('PDF مطابق للطباعة'), findsOneWidget);
    expect(
      Theme.of(tester.element(find.text(_telegramSubject)))
          .textTheme
          .bodyMedium
          ?.fontFamily,
      'Cairo',
    );
    expect(api.calls['telegrams.get'], {'id': 7});
  });
}
