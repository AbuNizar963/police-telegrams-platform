import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'telegram_display.dart';

const _arabicMonths = <String>[
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

bool _timeZonesInitialized = false;

/// Mirrors the web report's `formatConfiguredDate` for exported CSV dates.
///
/// The report date remains `createdAt`; this function only applies the user's
/// timezone, date format, time format, and number system. Invalid timezones
/// safely fall back to Asia/Riyadh, while absent dates remain empty.
String formatTelegramReportDate(Object? value, Map<String, dynamic> settings) {
  final rawValue = value?.toString().trim() ?? '';
  if (rawValue.isEmpty || rawValue == 'null') return '';

  final parsed = DateTime.tryParse(rawValue);
  if (parsed == null) return rawValue;

  if (!_timeZonesInitialized) {
    tzdata.initializeTimeZones();
    _timeZonesInitialized = true;
  }

  final timezone = settings['timezone']?.toString().trim();
  final date = _toConfiguredTimezone(
    parsed,
    timezone == null || timezone.isEmpty ? 'Asia/Riyadh' : timezone,
  );
  final use12HourTime = settings['timeFormat']?.toString() == '12';
  final period = use12HourTime ? (date.hour < 12 ? ' ص' : ' م') : '';
  final hour = use12HourTime ? ((date.hour + 11) % 12) + 1 : date.hour;
  final hourText = _pad(hour);
  final minuteText = _pad(date.minute);
  final secondsText = _pad(date.second);
  final dateFormat = settings['dateFormat']?.toString();

  late final String formatted;
  if (dateFormat == 'dd MMM yyyy HH:mm') {
    formatted =
        '${date.day} ${_arabicMonths[date.month - 1]} ${date.year} في '
        '$hourText:$minuteText$period';
  } else {
    final time = '$hourText:$minuteText:$secondsText$period';
    switch (dateFormat) {
      case 'yyyy-MM-dd HH:mm:ss':
        formatted = '${date.year}-${_pad(date.month)}-${_pad(date.day)} $time';
        break;
      case 'yyyy/MM/dd HH:mm:ss':
        formatted = '${date.year}/${_pad(date.month)}/${_pad(date.day)} $time';
        break;
      default:
        formatted = '${_pad(date.day)}/${_pad(date.month)}/${date.year} $time';
        break;
    }
  }

  return localizeTelegramDigits(formatted, settings['numberSystem'] ?? 'latin');
}

tz.TZDateTime _toConfiguredTimezone(DateTime value, String timezone) {
  final instant = value.toUtc();
  try {
    return tz.TZDateTime.from(instant, tz.getLocation(timezone));
  } catch (_) {
    return tz.TZDateTime.from(instant, tz.getLocation('Asia/Riyadh'));
  }
}

String _pad(int value) => value.toString().padLeft(2, '0');
