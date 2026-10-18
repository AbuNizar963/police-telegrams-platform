import 'package:flutter_test/flutter_test.dart';

import 'package:police_telegrams/telegram_excel_codec.dart';

void main() {
  test('builds a workbook with separate outgoing and incoming sheets', () {
    final bytes = buildTelegramWorkbook([
      {
        'serial': 'ص-1',
        'time': '08:30',
        'sender': 'أحمد',
        'date': '2026-10-16',
        'body': 'نص برقية صادر',
        'recipient': 'الوحدة',
        'signature': 'أحمد',
        'notes': '',
        'direction': 'صادر',
      },
      {
        'serial': 'و-1',
        'time': '09:00',
        'sender': 'المخفر',
        'date': '2026-10-16',
        'body': 'نص برقية وارد',
        'recipient': 'القيادة',
        'signature': 'المخفر',
        'notes': 'عاجل',
        'direction': 'وارد',
      },
    ]);

    final parsed = parseTelegramWorkbook(bytes);
    expect(parsed.sheets, containsAll(<String>['صادر', 'وارد']));
    expect(parsed.rows, hasLength(2));
    expect(parsed.rows.first.body, 'نص برقية صادر');
    expect(parsed.rows.last.sheetName, 'وارد');
  });

  test('uses the web-compatible fallback layout and rejects duplicates', () {
    final bytes = buildTelegramWorkbook([
      {
        'serial': '1',
        'time': '10:00',
        'sender': 'مرسل',
        'date': '2026-10-16',
        'body': 'بلاغ مهم',
        'recipient': 'مستلم',
        'signature': '',
        'notes': '',
        'direction': 'وارد',
      },
      {
        'serial': '1',
        'time': '10:00',
        'sender': 'مرسل',
        'date': '2026-10-16',
        'body': 'بلاغ مهم',
        'recipient': 'مستلم',
        'signature': '',
        'notes': '',
        'direction': 'وارد',
      },
    ]);

    final parsed = parseTelegramWorkbook(bytes);
    expect(parsed.rows, hasLength(1));
    expect(parsed.duplicateRows, 1);
    expect(parsed.issues.single.reason, contains('مكرر'));
  });

  test(
    'rejects repeated serials even when contents differ and digits are Arabic',
    () {
      final bytes = buildTelegramWorkbook([
        {
          'serial': '٢٣',
          'time': '10:00',
          'sender': 'مرسل',
          'date': '2026-10-16',
          'body': 'نص البرقية الأول',
          'recipient': 'مستلم',
          'signature': '',
          'notes': '',
          'direction': 'وارد',
        },
        {
          'serial': '23',
          'time': '11:00',
          'sender': 'مرسل آخر',
          'date': '2026-10-17',
          'body': 'محتوى مختلف للبرقية',
          'recipient': 'مستلم',
          'signature': '',
          'notes': '',
          'direction': 'وارد',
        },
      ]);

      final parsed = parseTelegramWorkbook(bytes);
      expect(parsed.rows, hasLength(1));
      expect(parsed.duplicateRows, 1);
    },
  );

  test('skips rows whose telegram body is too short', () {
    final bytes = buildTelegramWorkbook([
      {
        'serial': '1',
        'time': '',
        'sender': 'مرسل',
        'date': '',
        'body': 'لا',
        'recipient': '',
        'signature': '',
        'notes': '',
        'direction': 'صادر',
      },
    ]);

    // The workbook has no valid rows, so the parser reports the same clear
    // validation error shown by the web importer.
    expect(() => parseTelegramWorkbook(bytes), throwsA(isA<FormatException>()));
  });
}
