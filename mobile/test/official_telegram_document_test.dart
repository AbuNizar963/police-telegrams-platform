import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/official_telegram_document.dart';

void main() {
  const fonts = {
    400: 'data:font/ttf;base64,AA==',
    500: 'data:font/ttf;base64,AA==',
    600: 'data:font/ttf;base64,AA==',
    700: 'data:font/ttf;base64,AA==',
  };

  Map<String, dynamic> telegram({String body = 'نص الوثيقة'}) => {
    'serialCode': '72',
    'organizationId': 'unit-1',
    'currentOrganizationId': 'unit-1',
    'senderOrganizationName': 'قسم العمليات',
    'recipient': 'قيادة الأمن الداخلي',
    'subject': 'موضوع رسمي',
    'body': body,
    'classification': 'normal',
    'priority': 'urgent',
    'category': 'security',
    'status': 'approved',
    'verificationToken': 'verify-token',
    'creatorName': 'مستخدم الاختبار',
    'createdAt': '2026-10-15T00:00:00.000Z',
  };

  test(
    'builds the web-style A4 document with routing QR and official fields',
    () {
      final html = buildOfficialTelegramHtml(
        telegram: telegram(),
        settings: {
          'departmentName': 'قسم العمليات',
          'unitName': 'قيادة الأمن الداخلي',
          'unitChiefRank': 'العقيد',
          'unitChiefName': 'اسم المسؤول',
          'timezone': 'Asia/Riyadh',
          'dateFormat': 'yyyy/MM/dd HH:mm:ss',
          'numberSystem': 'latin',
        },
        routingDirectory: [
          {
            'id': 'unit-1',
            'name': 'قسم العمليات',
            'parentOrganizationId': null,
          },
        ],
        verificationUrl: 'https://example.test/verify/verify-token',
        fontDataUrls: fonts,
      );

      expect(html, contains('class="telegram-export-page"'));
      expect(html, contains('size:A4 portrait'));
      expect(html, contains('font-family:"Cairo"'));
      expect(html, contains('برقية صادرة'));
      expect(html, contains('درجة الأولوية:</strong> عاجل'));
      expect(html, contains('رمز QR للتحقق من أصالة البرقية'));
      expect(html, contains('<svg'));
      expect(html, contains('https://example.test/verify/verify-token'));
      expect(html, contains('اسم المسؤول'));
      expect(html, contains('نص الوثيقة'));
    },
  );

  test('escapes telegram text before embedding it in the renderer HTML', () {
    final html = buildOfficialTelegramHtml(
      telegram: telegram(body: '<script>alert("x")</script>'),
      settings: const {},
      routingDirectory: const [],
      verificationUrl: 'https://example.test/verify/token',
      fontDataUrls: fonts,
    );

    expect(html, contains('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
    expect(html, isNot(contains('<script>alert')));
  });
}
