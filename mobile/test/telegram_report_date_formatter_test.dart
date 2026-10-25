import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/telegram_report_date_formatter.dart';

void main() {
  const timestamp = '2026-01-02T15:04:05.000Z';

  test('uses the web default date format when settings are unavailable', () {
    expect(
      formatTelegramReportDate(timestamp, const {'timezone': 'UTC'}),
      '02/01/2026 15:04:05',
    );
  });

  test('supports the configured numeric date formats', () {
    expect(
      formatTelegramReportDate(timestamp, const {
        'timezone': 'UTC',
        'dateFormat': 'yyyy-MM-dd HH:mm:ss',
      }),
      '2026-01-02 15:04:05',
    );
    expect(
      formatTelegramReportDate(timestamp, const {
        'timezone': 'UTC',
        'dateFormat': 'yyyy/MM/dd HH:mm:ss',
      }),
      '2026/01/02 15:04:05',
    );
  });

  test('supports 12-hour time and Arabic digit localization', () {
    expect(
      formatTelegramReportDate(timestamp, const {
        'timezone': 'UTC',
        'dateFormat': 'yyyy/MM/dd HH:mm:ss',
        'timeFormat': '12',
      }),
      '2026/01/02 03:04:05 م',
    );
    expect(
      formatTelegramReportDate(timestamp, const {
        'timezone': 'UTC',
        'dateFormat': 'yyyy/MM/dd HH:mm:ss',
        'numberSystem': 'arabic',
      }),
      '٢٠٢٦/٠١/٠٢ ١٥:٠٤:٠٥',
    );
  });

  test('matches the Arabic month-name format used by the web', () {
    expect(
      formatTelegramReportDate(timestamp, const {
        'timezone': 'UTC',
        'dateFormat': 'dd MMM yyyy HH:mm',
        'timeFormat': '12',
      }),
      '2 يناير 2026 في 03:04 م',
    );
  });

  test('applies the configured timezone and safely falls back if invalid', () {
    final settings = const {
      'dateFormat': 'yyyy/MM/dd HH:mm:ss',
      'timezone': 'Asia/Riyadh',
    };
    expect(
      formatTelegramReportDate(timestamp, settings),
      '2026/01/02 18:04:05',
    );
    expect(
      formatTelegramReportDate(timestamp, const {
        'dateFormat': 'yyyy/MM/dd HH:mm:ss',
        'timezone': 'Invalid/Timezone',
      }),
      '2026/01/02 18:04:05',
    );
  });

  test('preserves missing and unparsable values safely', () {
    expect(formatTelegramReportDate(null, const {}), isEmpty);
    expect(formatTelegramReportDate('null', const {}), isEmpty);
    expect(formatTelegramReportDate('not-a-date', const {}), 'not-a-date');
  });
}
