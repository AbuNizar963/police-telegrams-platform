import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/advanced_create_telegram_page.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/public_pages.dart';

class _ScreenTestApi extends PoliceApi {
  _ScreenTestApi() : super(baseUrl: 'https://example.test');

  final calls = <String>[];
  Map<String, dynamic>? lastInput;

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
  }) async {
    calls.add(procedure);
    if (procedure == 'telegrams.create') {
      lastInput = input;
    }
    switch (procedure) {
      case 'telegrams.nextOutgoingSerial':
        return {'number': 73};
      case 'organizations.routingDirectory':
        return [
          {
            'id': 'destination-1',
            'name': 'قيادة الأمن الداخلي',
            'isSelectable': true,
            'isConfiguredDestination': true,
          },
          {
            'id': 'destination-2',
            'name': 'مديرية أمن حلب',
            'isSelectable': true,
            'isConfiguredDestination': false,
          },
        ];
      case 'organizations.descendants':
        return [
          {'id': 'child-1', 'name': 'قسم تابع'},
        ];
      case 'telegrams.create':
        return {'id': 42};
      case 'telegrams.uploadAttachment':
        return {'ok': true};
      default:
        throw StateError('Unexpected test procedure: $procedure');
    }
  }
}

Widget _host(Widget child) =>
    MaterialApp(theme: ThemeData(useMaterial3: true), home: child);

void main() {
  testWidgets('advanced composer renders web-matched fields and defaults', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(_host(AdvancedCreateTelegramSheet(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('إنشاء برقية جديدة'), findsOneWidget);
    expect(find.text('73'), findsOneWidget);
    expect(find.text('قيادة الأمن الداخلي'), findsOneWidget);
    expect(find.text('درجة السرية'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('درجة الأولوية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('درجة الأولوية'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('تصنيف البلاغ'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('تصنيف البلاغ'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('إرفاق صورة أو PDF أو ملف صوتي'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('إرفاق صورة أو PDF أو ملف صوتي'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('حفظ وإرسال البرقية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('حفظ وإرسال البرقية'), findsOneWidget);
    expect(api.calls, contains('organizations.routingDirectory'));
  });

  testWidgets('advanced composer validates required values before submission', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(_host(AdvancedCreateTelegramSheet(api: api)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('حفظ وإرسال البرقية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('حفظ وإرسال البرقية'));
    await tester.pump();

    expect(find.text('أكمل الموضوع والجهة ونص البرقية.'), findsOneWidget);
    expect(api.calls, isNot(contains('telegrams.create')));
  });

  testWidgets('advanced composer submits validated payload', (tester) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(_host(AdvancedCreateTelegramSheet(api: api)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('الموضوع'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.enterText(
      find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.hintText == 'عنوان مختصر ودقيق للبلاغ',
      ),
      'بلاغ اختباري',
    );
    await tester.scrollUntilVisible(
      find.text('نص البرقية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.enterText(
      find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.hintText == 'اكتب تفاصيل البلاغ...',
      ),
      'تفاصيل البلاغ للاختبار',
    );
    await tester.scrollUntilVisible(
      find.text('عاجل').first,
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('عاجل').first);
    await tester.scrollUntilVisible(
      find.text('حفظ وإرسال البرقية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('حفظ وإرسال البرقية'));
    await tester.pumpAndSettle();

    expect(api.lastInput?['requestedOrganizationSerialNumber'], 73);
    expect(api.lastInput?['subject'], 'بلاغ اختباري');
    expect(api.lastInput?['body'], 'تفاصيل البلاغ للاختبار');
    expect(api.lastInput?['recipientOrganizationId'], 'destination-1');
  });

  testWidgets('advanced composer supports priority and broadcast selection', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(_host(AdvancedCreateTelegramSheet(api: api)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('عاجل').first,
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('عاجل').first);
    await tester.scrollUntilVisible(
      find.text('كافة الوحدات').first,
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('كافة الوحدات').first);
    await tester.pump();

    expect(
      find.text('إرسال نسخة إلى الجهات التابعة مباشرة (1)'),
      findsOneWidget,
    );
    expect(find.byType(CheckboxListTile), findsOneWidget);
  });

  testWidgets('about and terms screens expose their main content', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const AboutPage()));
    expect(find.text('حول النظام'), findsWidgets);
    expect(find.text('ميزات النظام'), findsOneWidget);
    expect(find.text('سلامة السجل'), findsOneWidget);

    await tester.pumpWidget(_host(const TermsPage()));
    expect(find.text('الشروط والأحكام'), findsWidgets);
    expect(find.text('1. نطاق التطبيق والقبول'), findsOneWidget);
    expect(find.text('9. المخالفات والإجراءات'), findsOneWidget);
  });

  testWidgets('verification screen rejects an empty token locally', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(_host(VerifyTelegramPage(api: api)));

    await tester.tap(find.text('تحقق من البرقية'));
    await tester.pump();

    expect(find.text('أدخل رمز التحقق الموجود في الوثيقة.'), findsOneWidget);
  });
}
