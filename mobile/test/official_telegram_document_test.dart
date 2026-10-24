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
      expect(
        html,
        contains(
          'نوع الوثيقة:</strong> <span class="classification-value">برقية صادرة</span>',
        ),
      );
      expect(html, contains('درجة الأسبقية:</strong> عاجل'));
      expect(html, isNot(contains('درجة الأولوية:')));
      expect(html, contains('class="page-watermark"'));
      expect(html, contains('class="watermark-text-pattern"'));
      expect(html, contains('<span>وزارة الداخلية</span>'));
      expect(
        RegExp(r'<span>وزارة الداخلية</span>').allMatches(html),
        hasLength(176),
      );
      expect(html, isNot(contains('وزارة التربية')));
      expect(html, isNot(contains('class="official-logo"')));
      expect(html, isNot(contains('class="official-seal"')));
      expect(html, contains('رمز QR للتحقق من أصالة البرقية'));
      expect(html, contains('<svg'));
      expect(html, contains('<path d="M'));
      expect(html, contains('اسم المسؤول'));
      expect(html, contains('نص الوثيقة'));
    },
  );

  test(
    'preserves the imported serial while hiding incomplete original-record notes',
    () {
      final source = telegram()
        ..['originalSerial'] = 'ب ص ٠٠٦'
        ..['importNotes'] = 'رد على ب و ٦'
        ..['telegramDate'] = '2024-03-04T05:06:00.000Z';
      final html = buildOfficialTelegramHtml(
        telegram: source,
        settings: const {
          'numberSystem': 'latin',
          'timezone': 'UTC',
          'timeFormat': '12',
          'dateFormat': 'yyyy/MM/dd HH:mm:ss',
        },
        routingDirectory: const [],
        verificationUrl: 'https://example.test/verify/current-token',
        referenceLinks: const [
          {
            'serial': '6',
            'direction': 'incoming',
            'verificationToken': 'related-token',
          },
        ],
        fontDataUrls: fonts,
      );

      expect(html, contains('ب ص ٠٠٦'));
      expect(html, isNot(contains('ملاحظات السجل الأصلي')));
      expect(html, isNot(contains('class="import-notes"')));
      expect(html, isNot(contains('border-top:1px dotted #7b8493')));
      expect(
        html,
        matches(
          RegExp(
            r'<p class="footer-date">تاريخ إنشاء الوثيقة: \d{4}/\d{2}/\d{2} - \d{2}:\d{2}:\d{2}(?: [صم])?</p>',
          ),
        ),
      );
      expect(html, contains('الوقت والتاريخ:</strong>'));
      expect(html, contains('تاريخ إنشاء الوثيقة:'));
      expect(html, isNot(contains('<p class="footer-date">الوقت والتاريخ:')));
    },
  );

  test('omits the QR from the document when platform settings disable it', () {
    final html = buildOfficialTelegramHtml(
      telegram: telegram(),
      settings: const {},
      platformDocumentSettings: const {'showVerificationQr': false},
      routingDirectory: const [],
      verificationUrl: 'https://example.test/verify/verify-token',
      fontDataUrls: fonts,
    );

    expect(html, isNot(contains('class="routing-qr"')));
    expect(html, isNot(contains('<svg')));
    expect(html, contains('موضوع رسمي'));
    expect(html, contains('نص الوثيقة'));
  });

  test(
    'keeps the configured logo in the header and ministry text in watermark',
    () {
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
        contains('<img class="official-logo" src="data:image/png;base64,AA=="'),
      );
      expect(
        html,
        contains(
          '<img class="watermark-logo" src="data:image/png;base64,AA=="',
        ),
      );
      expect(html, contains('class="watermark-text-pattern"'));
      expect(
        html.indexOf('class="watermark-text-pattern"'),
        lessThan(html.indexOf('class="watermark-logo"')),
      );
      expect(html, contains('<span>وزارة الداخلية</span>'));
      expect(html, isNot(contains('وزارة التربية')));
      expect(html, contains('width:93.75%;height:93.75%'));
      expect(html, contains('column-gap:10mm;row-gap:10mm'));
      expect(html, contains('grid-template-columns:repeat(8,max-content)'));
      expect(html, contains('grid-template-rows:repeat(22,max-content)'));
      expect(html, contains('object-fit:contain;opacity:0.16'));
      expect(html, contains('overflow:hidden;opacity:0.16'));
      expect(html, contains('border-bottom:3px solid #b49a55'));
      expect(html, contains('object-fit:contain'));
      expect(html, contains('z-index:0'));
      expect(html, contains('z-index:1'));
    },
  );

  test(
    'applies owner branding settings and can hide only the repeated phrase',
    () {
      final html = buildOfficialTelegramHtml(
        telegram: telegram(),
        settings: const {},
        platformDocumentSettings: const {
          'showMinistryWatermarkText': false,
          'watermarkOpacityPercent': 35,
          'headerDividerColor': '#2457A6',
          'showVerificationQr': false,
        },
        routingDirectory: const [],
        verificationUrl: 'https://example.test/verify/token',
        fontDataUrls: fonts,
        logoDataUrl: 'data:image/png;base64,AA==',
      );

      expect(html, isNot(contains('class="watermark-text-pattern"')));
      expect(html, contains('class="watermark-logo"'));
      expect(html, isNot(contains('<span>وزارة الداخلية</span>')));
      expect(html, contains('class="official-logo"'));
      expect(html, contains('opacity:0.35'));
      expect(html, contains('border-bottom:3px solid #2457A6'));
      expect(html, isNot(contains('class="routing-qr"')));
      expect(html, isNot(contains('<svg')));
      // The official heading is separate from the repeated watermark option.
      expect(
        html,
        contains('<p class="government-subtitle">وزارة الداخلية</p>'),
      );
    },
  );

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
