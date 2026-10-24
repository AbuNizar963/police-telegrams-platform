/// Resolves the organization-scoped serial first, matching the web client.
/// Legacy fields are retained as a fallback for older API records.
String getTelegramSerialCode(Map<String, dynamic> telegram) {
  for (final key in const [
    'originalSerial',
    'organizationSerialCode',
    'serialCode',
    'serialNumber',
    'number',
  ]) {
    final value = telegram[key]?.toString().trim();
    if (value != null && value.isNotEmpty && value != 'null') return value;
  }
  return '';
}

/// Returns the short serial shown in web lists and document headings.
/// For example, `POL-2026-09-30-00690` becomes `690`.
String getTelegramDisplayNumber(Object? serialCode, {Object? originalSerial}) {
  final officialSerial = originalSerial?.toString().trim() ?? '';
  if (officialSerial.isNotEmpty && officialSerial != 'null') {
    return officialSerial;
  }

  final value = serialCode?.toString().trim() ?? '';
  if (value.isEmpty || value == 'null') return '—';

  final serialDigits = value.split('-').last;
  final parsedSerial = RegExp(r'^\d+').firstMatch(serialDigits)?.group(0);
  if (parsedSerial == null) return value;
  return int.tryParse(parsedSerial)?.toString() ?? parsedSerial;
}

/// Displays imported official serials exactly; generated serials retain compact localized display.
String getTelegramDisplaySerial(
  Map<String, dynamic> telegram,
  Object? numberSystem,
) {
  final originalSerial = telegram['originalSerial']?.toString().trim() ?? '';
  if (originalSerial.isNotEmpty && originalSerial != 'null') {
    return originalSerial;
  }
  return localizeTelegramDigits(
    getTelegramDisplayNumber(getTelegramSerialCode(telegram)),
    numberSystem,
  );
}

/// Mirrors the web's `localizeDigits` helper for the supported number systems.
String localizeTelegramDigits(Object? input, Object? numberSystem) {
  final value = input?.toString() ?? '';
  const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
  return value.replaceAllMapped(RegExp(r'[0-9٠-٩۰-۹०-९]'), (match) {
    final character = match.group(0)!;
    final codePoint = character.runes.first;
    final digit = switch (codePoint) {
      >= 0x30 && <= 0x39 => codePoint - 0x30,
      >= 0x660 && <= 0x669 => codePoint - 0x660,
      >= 0x6f0 && <= 0x6f9 => codePoint - 0x6f0,
      >= 0x966 && <= 0x96f => codePoint - 0x966,
      _ => null,
    };
    if (digit == null) return character;
    return numberSystem == 'arabic' ? arabicIndicDigits[digit] : '$digit';
  });
}
