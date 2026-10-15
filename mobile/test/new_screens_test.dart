import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/advanced_create_telegram_page.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/mobile_pages.dart';
import 'package:police_telegrams/public_pages.dart';
import 'package:police_telegrams/telegram_actions.dart';

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
    if (procedure == 'telegrams.create' ||
        procedure == 'profile.changePassword') {
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
      case 'telegrams.incomingRoutes':
      case 'telegrams.attachments':
        return <dynamic>[];
      case 'profile.get':
        return {'name': 'مشغل الاختبار', 'mustChangePassword': true};
      case 'profile.changePassword':
        return {'success': true};
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
      find.text('إرسال البرقية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('إرسال البرقية'), findsOneWidget);
    expect(api.calls, contains('organizations.routingDirectory'));
  });

  testWidgets('advanced composer validates required values before submission', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(_host(AdvancedCreateTelegramSheet(api: api)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('إرسال البرقية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('إرسال البرقية'));
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
      find.text('إرسال البرقية'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('إرسال البرقية'));
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

  testWidgets('profile requires matching password confirmation', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(
      _host(
        ProfileSettingsPage(
          api: api,
          onLogout: () async {},
          onProfileUpdated: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('كلمة مرور مؤقتة'), findsOneWidget);
    Future<void> enterField(String label, String value) async {
      final field = find.byWidgetPredicate(
        (widget) =>
            widget is TextField && widget.decoration?.labelText == label,
      );
      await tester.scrollUntilVisible(
        field,
        160,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(field, value);
    }

    await enterField('كلمة المرور الحالية', 'current-password');
    await enterField('كلمة المرور الجديدة', 'new-password-long');
    await enterField('تأكيد كلمة المرور', 'different-password');
    await tester.scrollUntilVisible(
      find.text('تغيير كلمة المرور'),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('تغيير كلمة المرور'));
    await tester.pumpAndSettle();

    // Validation errors render at the top of the profile form. Scroll to the
    // error before asserting because ListView may dispose off-screen children.
    await tester.scrollUntilVisible(
      find.text('تأكيد كلمة المرور غير مطابق.'),
      -240,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('تأكيد كلمة المرور غير مطابق.'), findsOneWidget);
    expect(api.calls, isNot(contains('profile.changePassword')));

    await enterField('تأكيد كلمة المرور', 'new-password-long');
    await tester.scrollUntilVisible(
      find.text('تغيير كلمة المرور'),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('تغيير كلمة المرور'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('profile.changePassword'));
    expect(find.textContaining('كلمة مرور مؤقتة'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('تسجيل الخروج'),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('إنهاء الجلسة'), findsOneWidget);
  });

  testWidgets('telegram transitions match its state and user role', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'in_review',
            canOperate: true,
            isAdmin: false,
            onChanged: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('اعتماد'), findsOneWidget);
    expect(find.text('إرجاع بسبب'), findsOneWidget);
    expect(find.text('رفض'), findsOneWidget);
    expect(find.text('أرشفة'), findsNothing);
    expect(find.text('إرسال طلب إحالة'), findsNothing);
  });

  testWidgets('approved telegram exposes routing to an authorized operator', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'approved',
            canOperate: true,
            isAdmin: false,
            onChanged: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('إرسال طلب إحالة'), findsOneWidget);
    expect(find.text('إكمال المعالجة'), findsOneWidget);
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
