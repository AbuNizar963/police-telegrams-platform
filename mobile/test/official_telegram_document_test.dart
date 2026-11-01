import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/official_telegram_document.dart';

void main() {
  const fonts = {
    400: 'data:font/ttf;base64,AA==',
    500: 'data:font/ttf;base64,AA==',
    600: 'data:font/ttf;base64,AA==',
    700: 'data:font/ttf;base64,AA==',
    900: 'data:font/ttf;base64,AA==',
  };

  Map<String, dynamic> telegram({String body = 'محتوى الاختبار'}) => {
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

  test('keeps physical A4 size and applies 10mm content insets', () {
    final html = buildOfficialTelegramHtml(
      telegram: telegram(),
      settings: const {},
      routingDirectory: const [],
      verificationUrl: 'https://example.test/verify/verify-token',
      fontDataUrls: fonts,
    );

    expect(html, contains('@page{size:A4 portrait;margin:0}'));
    expect(
      html,
      contains(
        'box-sizing:border-box;width:210mm;min-height:297mm;padding:10mm;',
      ),
    );
    expect(
      html,
      contains('@page telegram-multipage{size:A4 portrait;margin:10mm 0;'),
    );
    expect(
      html,
      contains(
        '.telegram-export-page.telegram-multipage{page:telegram-multipage;min-height:0;padding:0 10mm}',
      ),
    );
    expect(
      html,
      contains('.telegram-export-page{width:210mm;min-height:297mm}'),
    );
    expect(html, contains('counter(page) " من " counter(pages)'));
    expect(
      html,
      contains(
        "page.classList.toggle('telegram-multipage', page.getBoundingClientRect().height > (297 * 96 / 25.4) + 1);",
      ),
    );
    expect(html, isNot(contains('width:190mm')));
    expect(html, isNot(contains('(277 * 96 / 25.4)')));
  });

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
      expect(
        html,
        contains(
          'box-sizing:border-box;width:210mm;min-height:297mm;padding:10mm;',
        ),
      );
      expect(html, contains('@page{size:A4 portrait;margin:0}'));
      expect(html, contains('@page telegram-multipage'));
      expect(html, contains('counter(page) " من " counter(pages)'));
      expect(html, contains('classList.toggle(\'telegram-multipage\''));
      expect(html, contains('font-family:"Cairo"'));
      expect(
        html,
        contains(
          'نوع الوثيقة:</strong> <span class="classification-value">برقية صادرة</span>',
        ),
      );
      expect(html, contains('درجة الأسبقية:</strong> عاجلة'));
      expect(html, contains('درجة السرية:</strong> عادية'));
      expect(html, isNot(contains('درجة الأولوية:')));
      expect(html, contains('class="page-watermark"'));
      expect(html, contains('class="watermark-text-pattern"'));
      expect(html, contains('<span>وزارة الداخلية</span>'));
      expect(
        html,
        contains(
          'font-family:"Aref Ruqaa","Noto Naskh Arabic",Tahoma,serif;font-size:11pt',
        ),
      );
      expect(
        RegExp(r'<span>وزارة الداخلية</span>').allMatches(html),
        hasLength(330),
      );
      expect(html, isNot(contains('وزارة التربية')));
      expect(html, isNot(contains('class="official-logo"')));
      expect(html, isNot(contains('class="official-seal"')));
      expect(html, contains('رمز QR للتحقق من أصالة البرقية'));
      expect(
        html,
        contains(
          '<div class="routing-qr" role="img" aria-label="رمز QR للتحقق من أصالة البرقية">',
        ),
      );
      expect(html, contains('<svg xmlns="http://www.w3.org/2000/svg" width="'));
      expect(html, contains('<path d="M'));
      expect(html, contains('اسم المسؤول'));
      expect(html, contains('<h2 class="body-heading">نص البرقية</h2>'));
      expect(html, isNot(contains('نص الوثيقة')));
    },
  );

  test('archives each exported page as a separately numbered PNG', () {
    final archive = ZipDecoder().decodeBytes(
      createTelegramPageImageArchive([
        Uint8List.fromList([1, 2, 3]),
        Uint8List.fromList([4, 5, 6]),
        Uint8List.fromList([7, 8, 9]),
      ]),
    );

    expect(archive.files.map((file) => file.name).toList(), [
      'telegram-page-01.png',
      'telegram-page-02.png',
      'telegram-page-03.png',
    ]);
    expect(
      archive.files
          .map((file) => List<int>.from(file.content as List<int>))
          .toList(),
      [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
    );
  });

  test('renders the frozen organization and chief identity from the selected version', () {
    final source = telegram()
      ..['letterhead'] = {
        'organizationName': 'قسم شرطة الشهباء',
        'departmentName': 'قسم شرطة الشهباء',
        'unitName': 'قيادة الأمن الداخلي في محافظة حلب',
        'unitChiefRank': 'المقدم',
        'unitChiefName': 'غسان صالح كنو',
      };
    final html = buildOfficialTelegramHtml(
      telegram: source,
      settings: const {
        'departmentName': 'اسم جهة جديد',
        'unitChiefRank': 'رتبة جديدة',
        'unitChiefName': 'رئيس جديد',
        'numberSystem': 'latin',
      },
      routingDirectory: const [
        {
          'id': 'unit-1',
          'name': 'اسم الجهة بعد التغيير',
          'parentOrganizationId': null,
        },
      ],
      verificationUrl: 'https://example.test/verify/verify-token',
      fontDataUrls: fonts,
    );

    expect(html, contains('قسم شرطة الشهباء'));
    expect(html, contains('المقدم غسان صالح كنو'));
    expect(html, contains('رئيس قسم شرطة الشهباء'));
    expect(html, isNot(contains('اسم جهة جديد')));
    expect(html, isNot(contains('رئيس جديد')));
    expect(html, isNot(contains('اسم الجهة بعد التغيير')));
  });

  test('keeps the complete organization hierarchy in the official header', () {
    final source = telegram()
      ..remove('senderOrganizationName')
      ..['organizationId'] = 'station-1'
      ..['currentOrganizationId'] = 'station-1';
    final html = buildOfficialTelegramHtml(
      telegram: source,
      settings: const {'numberSystem': 'latin'},
      routingDirectory: const [
        {
          'id': 'ministry',
          'name': 'وزارة الداخلية',
          'parentOrganizationId': null,
        },
        {
          'id': 'command',
          'name': 'قيادة الأمن الداخلي في المحافظة',
          'parentOrganizationId': 'ministry',
        },
        {
          'id': 'station-1',
          'name': 'قسم الشرطة',
          'parentOrganizationId': 'command',
        },
      ],
      verificationUrl: 'https://example.test/verify/verify-token',
      fontDataUrls: fonts,
    );

    expect(
      html,
      contains('<p>قيادة الأمن الداخلي في المحافظة</p><p>قسم الشرطة</p>'),
    );
    expect(html, isNot(contains('<p>وزارة الداخلية</p>')));
    expect(html, contains('<p><strong>من:</strong> قسم الشرطة</p>'));
  });

  test('preserves the imported serial while hiding incomplete original-record notes', () {
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
      contains(
        '<span class="footer-text">منشئ الوثيقة: مستخدم الاختبار</span>',
      ),
    );
    expect(
      html,
      contains(
        '<span class="footer-text"><span class="footer-date-label">تاريخ ووقت إخراج النسخة:</span> <span class="footer-output-time">يُحدَّد عند الإخراج</span></span>',
      ),
    );
    expect(html, contains('data-icon="person" aria-hidden="true"'));
    expect(html, contains('data-icon="location" aria-hidden="true"'));
    expect(html, contains('data-icon="calendar" aria-hidden="true"'));
    expect(
      html,
      contains(
        'grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr) minmax(0, 1.35fr);',
      ),
    );
    expect(html, contains('gap: 2px;'));
    expect(html, contains('white-space: nowrap;'));
    expect(html, isNot(contains('تم إنشاء هذه الوثيقة بواسطة:')));
    expect(html, contains('الوقت والتاريخ:</strong>'));
    expect(html, contains('تاريخ ووقت إخراج النسخة:'));
    expect(html, isNot(contains('2026/10/15')));
    expect(html, isNot(contains('<p class="footer-date">الوقت والتاريخ:')));
  });

  test('stamps each exported document with the supplied server event time', () {
    final html = buildOfficialTelegramHtml(
      telegram: telegram(),
      settings: const {
        'timezone': 'UTC',
        'dateFormat': 'yyyy/MM/dd HH:mm:ss',
        'numberSystem': 'latin',
      },
      routingDirectory: const [],
      verificationUrl: 'https://example.test/verify/verify-token',
      fontDataUrls: fonts,
      outputTimestamp: '2026-10-30T12:34:56.000Z',
    );

    expect(
      html,
      contains('<span class="footer-output-time">2026/10/30 - 12:34:56</span>'),
    );
    expect(html, contains('2026/10/15'));
  });

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
    expect(html, isNot(contains('رمز QR للتحقق من أصالة البرقية')));
    expect(html, contains('data-icon="person"'));
    expect(html, contains('موضوع رسمي'));
    expect(html, contains('<h2 class="body-heading">نص البرقية</h2>'));
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
      expect(html, contains('inset:3mm;'));
      expect(html, contains('gap:5mm;'));
      expect(html, contains('font-size:11pt'));
      expect(html, contains('translateX(-10.3mm)'));
      expect(html, contains('font-family: "Aref Ruqaa"'));
      expect(html, contains('watermark-text-row-offset'));
      expect(html, contains('width:max-content;gap:5mm;white-space:nowrap'));
      expect(
        html,
        contains(
          'watermark-text-pattern{position:absolute;z-index:0;inset:3mm;',
        ),
      );
      expect(html, contains('inset:3mm;'));
      expect(html, contains('opacity:0.12'));
      expect(html, contains('src: url("data:font/ttf;base64,AA==")'));
      expect(html, contains('object-fit:contain;opacity:0.12'));
      expect(html, contains('overflow:hidden;opacity:0.12'));
      expect(html, contains('border-bottom:3px solid #b49a55'));
      expect(
        html,
        contains(
          '.telegram-export-page .header-government p,.telegram-export-page .header-metadata p{margin:0;font-size:15pt;font-weight:700;line-height:1.5;',
        ),
      );
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
      expect(html, contains('data-icon="person"'));
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
