import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/push_notifications.dart';

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
      'telegrams.list' => {'items': <dynamic>[]},
      'notifications.inbox' => <dynamic>[],
      _ => <String, dynamic>{},
    };
  }
}

void main() {
  test('push service construction does not require Firebase configuration', () {
    expect(PushNotificationService.new, returnsNormally);
  });

  testWidgets('shows police telegram login screen', (tester) async {
    await tester.pumpWidget(PoliceTelegramsApp(api: _TestPoliceApi()));
    await tester.pumpAndSettle();

    expect(find.text('برقيات الشرطة'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.text('اسم المستخدم'), findsOneWidget);
  });

  testWidgets('dashboard matches reference layout and KPI filters work', (
    tester,
  ) async {
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(PoliceTelegramsApp(api: api));
    await tester.pumpAndSettle();

    expect(find.byTooltip('إنشاء برقية'), findsOneWidget);
    expect(find.text('تقرير البرقيات'), findsOneWidget);
    expect(find.text('تخصيص العرض'), findsOneWidget);
    expect(find.text('الفلاتر'), findsOneWidget);
    expect(find.text('الواردة اليوم'), findsOneWidget);
    expect(find.text('مرحبًا مشغل النظام'), findsNothing);

    final incomingStat = find.text('الواردة اليوم');
    await tester.tap(
      find.ancestor(of: incomingStat, matching: find.byType(InkWell)).first,
    );
    await tester.pumpAndSettle();

    expect(api.calls['telegrams.list']?['direction'], 'incoming');
    expect(api.calls['telegrams.list']?['from'], isA<String>());
    expect(api.calls['telegrams.list']?['to'], isA<String>());

    await tester.scrollUntilVisible(
      find.text('سجل البرقيات الكامل'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('سجل البرقيات الكامل'), findsOneWidget);
  });
}
