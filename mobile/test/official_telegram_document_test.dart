import 'dart:ui' as ui;

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
      expect(html, isNot(contains('class="page-watermark"')));
      expect(html, isNot(contains('class="official-logo"')));
      expect(html, isNot(contains('class="watermark-seal"')));
      expect(html, isNot(contains('class="official-seal"')));
      expect(html, contains('رمز QR للتحقق من أصالة البرقية'));
      expect(html, contains('<svg'));
      expect(html, contains('<path d="M'));
      expect(html, contains('اسم المسؤول'));
      expect(html, contains('نص الوثيقة'));
    },
  );

  test(
    'omits the QR from the document when organization settings disable it',
    () {
      final html = buildOfficialTelegramHtml(
        telegram: telegram(),
        settings: const {'showVerificationQr': false},
        routingDirectory: const [],
        verificationUrl: 'https://example.test/verify/verify-token',
        fontDataUrls: fonts,
      );

      expect(html, isNot(contains('class="routing-qr"')));
      expect(html, isNot(contains('<svg')));
      expect(html, contains('موضوع رسمي'));
      expect(html, contains('نص الوثيقة'));
    },
  );

  test('includes the configured organization logo as a visible watermark', () {
    final html = buildOfficialTelegramHtml(
      telegram: telegram(),
      settings: const {},
      routingDirectory: const [],
      verificationUrl: 'https://example.test/verify/token',
      fontDataUrls: fonts,
      logoDataUrl: 'data:image/png;base64,AA==',
    );

    expect(
      html,
      contains('<img class="watermark-logo" src="data:image/png;base64,AA=="'),
    );
    expect(html, contains('object-fit:contain'));
    expect(html, contains('z-index:0'));
    expect(html, contains('z-index:1'));
  });

  test('preserves source logo resolution and aspect ratio', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawRect(
      const ui.Rect.fromLTWH(0, 0, 120, 60),
      ui.Paint()..color = const ui.Color(0xFFD8C38E),
    );
    final picture = recorder.endRecording();
    final sourceImage = await picture.toImage(120, 60);
    picture.dispose();
    final sourceData = await sourceImage.toByteData(
      format: ui.ImageByteFormat.png,
    );
    sourceImage.dispose();
    final sourceBytes = sourceData!.buffer.asUint8List(
      sourceData.offsetInBytes,
      sourceData.lengthInBytes,
    );

    final normalized = await normalizeOfficialDocumentLogo(sourceBytes);
    final codec = await ui.instantiateImageCodec(normalized);
    try {
      final frame = await codec.getNextFrame();
      try {
        expect(frame.image.width, 120);
        expect(frame.image.height, 60);
      } finally {
        frame.image.dispose();
      }
    } finally {
      codec.dispose();
    }
  });

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
