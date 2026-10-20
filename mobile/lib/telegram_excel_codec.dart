import 'package:excel/excel.dart';

const telegramExcelHeaders = [
  'الرقم المتسلسل',
  'ساعة الأرسال أو الوصول',
  'التاريخ',
  'الجهة المرسلة واسم المرسل',
  'نـــــــــــص البرقيــــــــــــــــــــــــة',
  'الجهة المرسلة واسم المستلم',
  'توقيع المرسل أو المستلم',
  'ملاحظات',
];

class TelegramExcelRow {
  const TelegramExcelRow({
    required this.originalSerial,
    required this.time,
    required this.sender,
    required this.date,
    required this.body,
    required this.recipient,
    required this.signature,
    required this.notes,
    required this.sheetName,
  });

  final String originalSerial;
  final String time;
  final String sender;
  final String date;
  final String body;
  final String recipient;
  final String signature;
  final String notes;
  final String sheetName;

  TelegramExcelRow copyWith({
    String? originalSerial,
    String? time,
    String? sender,
    String? date,
    String? body,
    String? recipient,
    String? signature,
    String? notes,
  }) => TelegramExcelRow(
    originalSerial: originalSerial ?? this.originalSerial,
    time: time ?? this.time,
    sender: sender ?? this.sender,
    date: date ?? this.date,
    body: body ?? this.body,
    recipient: recipient ?? this.recipient,
    signature: signature ?? this.signature,
    notes: notes ?? this.notes,
    sheetName: sheetName,
  );

  Map<String, dynamic> toImportMap() => {
    'originalSerial': originalSerial,
    'time': time,
    'sender': sender,
    'date': date,
    'body': body,
    'recipient': recipient,
    'signature': signature,
    'notes': notes,
    'sheetName': sheetName,
  };
}

class TelegramExcelIssue {
  const TelegramExcelIssue({
    required this.rowNumber,
    required this.sheetName,
    required this.reason,
    this.value = '',
  });

  final int rowNumber;
  final String sheetName;
  final String reason;
  final String value;
}

class TelegramExcelParseResult {
  const TelegramExcelParseResult({
    required this.rows,
    required this.skippedRows,
    required this.duplicateRows,
    required this.issues,
    required this.sheets,
  });

  final List<TelegramExcelRow> rows;
  final int skippedRows;
  final int duplicateRows;
  final List<TelegramExcelIssue> issues;
  final List<String> sheets;
}

String _text(dynamic value) {
  if (value == null) return '';
  if (value is TextCellValue) return value.value.text?.trim() ?? '';
  if (value is IntCellValue) return '${value.value}';
  if (value is DoubleCellValue) {
    final number = value.value;
    return number == number.roundToDouble()
        ? number.toInt().toString()
        : number.toString();
  }
  if (value is DateCellValue) {
    return '${value.year.toString().padLeft(4, '0')}-'
        '${value.month.toString().padLeft(2, '0')}-'
        '${value.day.toString().padLeft(2, '0')}';
  }
  if (value is DateTimeCellValue) {
    final date = value.asDateTimeLocal();
    return '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')} '
        '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}:'
        '${date.second.toString().padLeft(2, '0')}';
  }
  if (value is TimeCellValue) {
    return '${value.hour.toString().padLeft(2, '0')}:'
        '${value.minute.toString().padLeft(2, '0')}:00';
  }
  return '$value'.trim();
}

String _dateText(dynamic value) {
  if (value is DateTimeCellValue) {
    final date = value.asDateTimeLocal();
    return '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';
  }
  return _text(value);
}

String _timeText(dynamic value) {
  if (value is DateTimeCellValue) {
    final date = value.asDateTimeLocal();
    return '\${date.hour.toString().padLeft(2, '0')}:'
        '\${date.minute.toString().padLeft(2, '0')}:'
        '\${date.second.toString().padLeft(2, '0')}';
  }
  if (value is TimeCellValue) return _text(value);

  if (value is IntCellValue || value is DoubleCellValue) {
    final number = value is IntCellValue
        ? value.value.toDouble()
        : (value as DoubleCellValue).value;
    if (number >= 0 && number < 1) {
      final totalSeconds = (number * 86400).round() % 86400;
      return '\${(totalSeconds ~/ 3600).toString().padLeft(2, '0')}:'
          '\${((totalSeconds % 3600) ~/ 60).toString().padLeft(2, '0')}:'
          '\${(totalSeconds % 60).toString().padLeft(2, '0')}';
    }
    if (number >= 0 && number <= 24) {
      final totalSeconds = (number * 3600).round();
      return '\${(totalSeconds ~/ 3600).toString().padLeft(2, '0')}:'
          '\${((totalSeconds % 3600) ~/ 60).toString().padLeft(2, '0')}:'
          '\${(totalSeconds % 60).toString().padLeft(2, '0')}';
    }
  }

  final normalized = _text(value).replaceAllMapped(
    RegExp('[٠-٩۰-۹]'),
    (match) => '\${'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(match.group(0)!) % 10}',
  );
  final match = RegExp(
    r'^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(ص|م|AM|PM)?$',
    caseSensitive: false,
  ).firstMatch(normalized);
  if (match == null) return normalized;

  var hour = int.parse(match.group(1)!);
  final minute = int.tryParse(match.group(2) ?? '') ?? 0;
  final second = int.tryParse(match.group(3) ?? '') ?? 0;
  final meridiem = (match.group(4) ?? '').toUpperCase();
  if (minute > 59 || second > 59 || hour > 24) return normalized;
  if (meridiem.isNotEmpty) {
    if (hour < 1 || hour > 12) return normalized;
    if (meridiem == 'م' || meridiem == 'PM') {
      hour = hour % 12 + 12;
    } else {
      hour %= 12;
    }
  }

  return '\${hour.toString().padLeft(2, '0')}:'
      '\${minute.toString().padLeft(2, '0')}:'
      '\${second.toString().padLeft(2, '0')}';
}
String _normalized(String value) => value
    .replaceAll(RegExp(r'[\s_ـ]+'), '')
    .replaceAll(RegExp('[أإآ]'), 'ا')
    .replaceAll('ى', 'ي')
    .replaceAllMapped(RegExp('[٠-٩۰-۹]'), (match) {
      final digit = match.group(0)!;
      return '${'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10}';
    })
    .toLowerCase();

Map<String, int> _headerIndexes(List<dynamic> header) {
  final normalized = header.map((cell) => _normalized(_text(cell))).toList();
  int find(List<String> aliases) {
    return normalized.indexWhere(
      (header) => aliases.any((alias) => header.contains(_normalized(alias))),
    );
  }

  return {
    'serial': find(['الرقم المتسلسل', 'رقم البرقية', 'الرقم']),
    'time': find(['ساعة الأرسال أو الوصول', 'ساعة الإرسال أو الوصول', 'الوقت']),
    'sender': find(['الجهة المرسلة واسم المرسل', 'الجهة والمرسل', 'المرسل']),
    'date': find(['تاريخ البرقية', 'تاريخ']),
    'body': find(['نص البرقية', 'نص البرقية الرسمي', 'نص']),
    'recipient': find([
      'الجهة المرسلة واسم المستلم',
      'الجهة والمستلم',
      'المستلم',
    ]),
    'signature': find(['توقيع المرسل أو المستلم', 'التوقيع']),
    'notes': find(['ملاحظات', 'الملاحظة']),
  };
}

String _cell(List<dynamic> row, int index) =>
    index >= 0 && index < row.length ? _text(row[index]) : '';

List<CellValue> _excelRow(List<String> values) =>
    values.map(TextCellValue.new).toList();

List<int> buildTelegramWorkbook(
  List<Map<String, String>> rows, {
  String fileName = 'سجل-البرقيات.xlsx',
}) {
  final workbook = Excel.createExcel();
  if (workbook.tables.containsKey('Sheet1')) workbook.delete('Sheet1');

  for (final sheetName in ['صادر', 'وارد']) {
    final headers = telegramExcelHeaders;
    final sheet = workbook[sheetName];
    sheet.appendRow(_excelRow(headers));
    final headerColors = [
      '#10233F',
      '#00B0F0',
      '#92D050',
      '#00B0F0',
      '#FF0000',
      '#00B0F0',
      '#00B050',
      '#FFFF00',
    ];
    for (var column = 0; column < headers.length; column++) {
      final cell = sheet.cell(
        CellIndex.indexByColumnRow(columnIndex: column, rowIndex: 0),
      );
      cell.cellStyle = CellStyle(
        backgroundColorHex: ExcelColor.fromHexString(headerColors[column]),
        fontFamily: 'Times New Roman',
        fontSize: (column == 0 || column == 4) ? 18 : 14,
        bold: true,
        horizontalAlign: HorizontalAlign.Center,
        verticalAlign: VerticalAlign.Center,
        textWrapping: TextWrapping.WrapText,
        topBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
        bottomBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
        leftBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
        rightBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
      );
      const columnWidths = [16, 11, 11, 15, 100, 18, 17, 14];
      sheet.setColumnWidth(column, columnWidths[column].toDouble());
    }

    final sheetRows = rows.where((row) => row['direction'] == sheetName);
    var rowIndex = 1;
    for (final row in sheetRows) {
      final values = [
        row['serial'] ?? '',
        row['time'] ?? '',
        row['date'] ?? '',
        row['sender'] ?? '',
        row['body'] ?? '',
        row['recipient'] ?? '',
        row['signature'] ?? '',
        row['notes'] ?? '',
      ];
      sheet.appendRow(_excelRow(values));
      for (var column = 0; column < values.length; column++) {
        final cell = sheet.cell(
          CellIndex.indexByColumnRow(columnIndex: column, rowIndex: rowIndex),
        );
        final isSerial = column == 0;
        final isBody = column == 4;
        cell.cellStyle = CellStyle(
          backgroundColorHex: ExcelColor.fromHexString(
            isSerial
                ? '#00B0F0'
                : isBody
                ? '#FFF0F0'
                : '#FFFFFF',
          ),
          fontFamily: 'Times New Roman',
          fontSize: isSerial ? 18 : 14,
          bold: true,
          horizontalAlign: HorizontalAlign.Center,
          verticalAlign: VerticalAlign.Center,
          textWrapping: TextWrapping.WrapText,
          topBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
          bottomBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
          leftBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
          rightBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
        );
      }
      rowIndex += 1;
    }
  }
  workbook.setDefaultSheet('صادر');
  return workbook.save(fileName: fileName) ?? <int>[];
}

TelegramExcelParseResult parseTelegramWorkbook(List<int> bytes) {
  if (bytes.length > 15 * 1024 * 1024) {
    throw const FormatException(
      'حجم ملف Excel أكبر من الحد المسموح وهو 15 ميغابايت.',
    );
  }
  final workbook = Excel.decodeBytes(bytes);
  final rows = <TelegramExcelRow>[];
  final issues = <TelegramExcelIssue>[];
  final fingerprints = <String>{};
  final serials = <String>{};
  var skippedRows = 0;
  var duplicateRows = 0;

  for (final sheetName in workbook.tables.keys) {
    final direction = sheetName.trim() == 'وارد' ? 'وارد' : 'صادر';
    final sheet = workbook.tables[sheetName]!;
    final matrix = sheet.rows
        .map((row) => row.map((cell) => cell?.value).toList())
        .toList();
    if (matrix.isEmpty) continue;

    var headerIndex = matrix.indexWhere(
      (row) => row.any(
        (value) => _normalized(_text(value)).contains('الرقمالتسلسلي'),
      ),
    );
    if (headerIndex < 0) headerIndex = 0;
    if (headerIndex > 10) headerIndex = 10;
    final indexes = _headerIndexes(matrix[headerIndex]);
    final hasDate = (indexes['date'] ?? -1) >= 0;
    final fallback = {
      'serial': (indexes['serial'] ?? -1) >= 0 ? indexes['serial']! : 0,
      'time': (indexes['time'] ?? -1) >= 0 ? indexes['time']! : 1,
      'sender': (indexes['sender'] ?? -1) >= 0 ? indexes['sender']! : 2,
      'date': hasDate ? indexes['date']! : -1,
      'body': (indexes['body'] ?? -1) >= 0
          ? indexes['body']!
          : hasDate
          ? 4
          : 3,
      'recipient': (indexes['recipient'] ?? -1) >= 0
          ? indexes['recipient']!
          : hasDate
          ? 5
          : 4,
      'signature': (indexes['signature'] ?? -1) >= 0
          ? indexes['signature']!
          : hasDate
          ? 6
          : 5,
      'notes': (indexes['notes'] ?? -1) >= 0
          ? indexes['notes']!
          : hasDate
          ? 7
          : 6,
    };

    for (var offset = headerIndex + 1; offset < matrix.length; offset++) {
      final row = matrix[offset];
      final body = _cell(row, fallback['body']!);
      final sender = _cell(row, fallback['sender']!);
      final recipient = _cell(row, fallback['recipient']!);
      final notes = _cell(row, fallback['notes']!);
      if (body.isEmpty &&
          sender.isEmpty &&
          recipient.isEmpty &&
          notes.isEmpty) {
        continue;
      }
      final rowNumber = offset + 1;
      if (body.length < 3) {
        skippedRows++;
        issues.add(
          TelegramExcelIssue(
            rowNumber: rowNumber,
            sheetName: sheetName,
            reason: 'نص البرقية فارغ أو أقصر من الحد الأدنى.',
            value: body,
          ),
        );
        continue;
      }
      final originalSerial = _cell(row, fallback['serial']!);
      final date = fallback['date']! >= 0
          ? _dateText(row[fallback['date']!])
          : '';
      final time = fallback['time']! < row.length
          ? _timeText(row[fallback['time']!])
          : '';
      final serialKey = '$direction|${_normalized(originalSerial)}';
      final fingerprint = [
        direction,
        _normalized(originalSerial),
        _normalized(date),
        _normalized(time),
        _normalized(body),
      ].join('|');
      if (!fingerprints.add(fingerprint) ||
          (originalSerial.isNotEmpty && !serials.add(serialKey))) {
        duplicateRows++;
        issues.add(
          TelegramExcelIssue(
            rowNumber: rowNumber,
            sheetName: sheetName,
            reason: 'صف مكرر داخل الملف وتم استبعاده تلقائياً.',
            value: originalSerial.isEmpty
                ? body.substring(0, body.length > 80 ? 80 : body.length)
                : originalSerial,
          ),
        );
        continue;
      }
      if (originalSerial.isEmpty) serials.add(serialKey);
      rows.add(
        TelegramExcelRow(
          originalSerial: originalSerial,
          time: time,
          sender: sender,
          date: date,
          body: body,
          recipient: recipient,
          signature: _cell(row, fallback['signature']!),
          notes: notes,
          sheetName: direction,
        ),
      );
    }
  }

  if (rows.isEmpty) {
    throw const FormatException(
      'لم يعثر النظام على صفوف برقيات صالحة. تأكد من وجود عمود نص البرقية وعدم رفع قالب فارغ.',
    );
  }
  if (rows.length > 1000) {
    throw const FormatException(
      'الحد الأقصى للاستيراد في العملية الواحدة هو 1000 برقية.',
    );
  }
  return TelegramExcelParseResult(
    rows: rows,
    skippedRows: skippedRows,
    duplicateRows: duplicateRows,
    issues: issues.take(100).toList(),
    sheets: workbook.tables.keys.toList(),
  );
}
,
    caseSensitive: false,
  ).firstMatch(normalized);
  if (match == null) return normalized;
  var hour = int.parse(match.group(1)!);
  final minute = int.tryParse(match.group(2) ?? '') ?? 0;
  final second = int.tryParse(match.group(3) ?? '') ?? 0;
  final meridiem = (match.group(4) ?? '').toUpperCase();
  if (minute > 59 || second > 59 || hour > 24) return normalized;
  if (meridiem.isNotEmpty) {
    if (hour < 1 || hour > 12) return normalized;
    if (meridiem == 'م' || meridiem == 'PM') {
      hour = hour % 12 + 12;
    } else {
      hour %= 12;
    }
  }
  return '${hour.toString().padLeft(2, '0')}:'
      '${minute.toString().padLeft(2, '0')}:'
      '${second.toString().padLeft(2, '0')}';
}

String _normalized(String value) => value
    .replaceAll(RegExp(r'[\s_ـ]+'), '')
    .replaceAll(RegExp('[أإآ]'), 'ا')
    .replaceAll('ى', 'ي')
    .replaceAllMapped(RegExp('[٠-٩۰-۹]'), (match) {
      final digit = match.group(0)!;
      return '${'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10}';
    })
    .toLowerCase();

Map<String, int> _headerIndexes(List<dynamic> header) {
  final normalized = header.map((cell) => _normalized(_text(cell))).toList();
  int find(List<String> aliases) {
    return normalized.indexWhere(
      (header) => aliases.any((alias) => header.contains(_normalized(alias))),
    );
  }

  return {
    'serial': find(['الرقم المتسلسل', 'رقم البرقية', 'الرقم']),
    'time': find(['ساعة الأرسال أو الوصول', 'ساعة الإرسال أو الوصول', 'الوقت']),
    'sender': find(['الجهة المرسلة واسم المرسل', 'الجهة والمرسل', 'المرسل']),
    'date': find(['تاريخ البرقية', 'تاريخ']),
    'body': find(['نص البرقية', 'نص البرقية الرسمي', 'نص']),
    'recipient': find([
      'الجهة المرسلة واسم المستلم',
      'الجهة والمستلم',
      'المستلم',
    ]),
    'signature': find(['توقيع المرسل أو المستلم', 'التوقيع']),
    'notes': find(['ملاحظات', 'الملاحظة']),
  };
}

String _cell(List<dynamic> row, int index) =>
    index >= 0 && index < row.length ? _text(row[index]) : '';

List<CellValue> _excelRow(List<String> values) =>
    values.map(TextCellValue.new).toList();

List<int> buildTelegramWorkbook(
  List<Map<String, String>> rows, {
  String fileName = 'سجل-البرقيات.xlsx',
}) {
  final workbook = Excel.createExcel();
  if (workbook.tables.containsKey('Sheet1')) workbook.delete('Sheet1');

  for (final sheetName in ['صادر', 'وارد']) {
    final headers = telegramExcelHeaders;
    final sheet = workbook[sheetName];
    sheet.appendRow(_excelRow(headers));
    final headerColors = [
      '#10233F',
      '#00B0F0',
      '#92D050',
      '#00B0F0',
      '#FF0000',
      '#00B0F0',
      '#00B050',
      '#FFFF00',
    ];
    for (var column = 0; column < headers.length; column++) {
      final cell = sheet.cell(
        CellIndex.indexByColumnRow(columnIndex: column, rowIndex: 0),
      );
      cell.cellStyle = CellStyle(
        backgroundColorHex: ExcelColor.fromHexString(headerColors[column]),
        fontFamily: 'Times New Roman',
        fontSize: (column == 0 || column == 4) ? 18 : 14,
        bold: true,
        horizontalAlign: HorizontalAlign.Center,
        verticalAlign: VerticalAlign.Center,
        textWrapping: TextWrapping.WrapText,
        topBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
        bottomBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
        leftBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
        rightBorder: Border(
          borderStyle: BorderStyle.Thin,
          borderColorHex: ExcelColor.fromHexString('#000000'),
        ),
      );
      const columnWidths = [16, 11, 11, 15, 100, 18, 17, 14];
      sheet.setColumnWidth(column, columnWidths[column].toDouble());
    }

    final sheetRows = rows.where((row) => row['direction'] == sheetName);
    var rowIndex = 1;
    for (final row in sheetRows) {
      final values = [
        row['serial'] ?? '',
        row['time'] ?? '',
        row['date'] ?? '',
        row['sender'] ?? '',
        row['body'] ?? '',
        row['recipient'] ?? '',
        row['signature'] ?? '',
        row['notes'] ?? '',
      ];
      sheet.appendRow(_excelRow(values));
      for (var column = 0; column < values.length; column++) {
        final cell = sheet.cell(
          CellIndex.indexByColumnRow(columnIndex: column, rowIndex: rowIndex),
        );
        final isSerial = column == 0;
        final isBody = column == 4;
        cell.cellStyle = CellStyle(
          backgroundColorHex: ExcelColor.fromHexString(
            isSerial
                ? '#00B0F0'
                : isBody
                ? '#FFF0F0'
                : '#FFFFFF',
          ),
          fontFamily: 'Times New Roman',
          fontSize: isSerial ? 18 : 14,
          bold: true,
          horizontalAlign: HorizontalAlign.Center,
          verticalAlign: VerticalAlign.Center,
          textWrapping: TextWrapping.WrapText,
          topBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
          bottomBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
          leftBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
          rightBorder: Border(
            borderStyle: BorderStyle.Thin,
            borderColorHex: ExcelColor.fromHexString('#000000'),
          ),
        );
      }
      rowIndex += 1;
    }
  }
  workbook.setDefaultSheet('صادر');
  return workbook.save(fileName: fileName) ?? <int>[];
}

TelegramExcelParseResult parseTelegramWorkbook(List<int> bytes) {
  if (bytes.length > 15 * 1024 * 1024) {
    throw const FormatException(
      'حجم ملف Excel أكبر من الحد المسموح وهو 15 ميغابايت.',
    );
  }
  final workbook = Excel.decodeBytes(bytes);
  final rows = <TelegramExcelRow>[];
  final issues = <TelegramExcelIssue>[];
  final fingerprints = <String>{};
  final serials = <String>{};
  var skippedRows = 0;
  var duplicateRows = 0;

  for (final sheetName in workbook.tables.keys) {
    final direction = sheetName.trim() == 'وارد' ? 'وارد' : 'صادر';
    final sheet = workbook.tables[sheetName]!;
    final matrix = sheet.rows
        .map((row) => row.map((cell) => cell?.value).toList())
        .toList();
    if (matrix.isEmpty) continue;

    var headerIndex = matrix.indexWhere(
      (row) => row.any(
        (value) => _normalized(_text(value)).contains('الرقمالتسلسلي'),
      ),
    );
    if (headerIndex < 0) headerIndex = 0;
    if (headerIndex > 10) headerIndex = 10;
    final indexes = _headerIndexes(matrix[headerIndex]);
    final hasDate = (indexes['date'] ?? -1) >= 0;
    final fallback = {
      'serial': (indexes['serial'] ?? -1) >= 0 ? indexes['serial']! : 0,
      'time': (indexes['time'] ?? -1) >= 0 ? indexes['time']! : 1,
      'sender': (indexes['sender'] ?? -1) >= 0 ? indexes['sender']! : 2,
      'date': hasDate ? indexes['date']! : -1,
      'body': (indexes['body'] ?? -1) >= 0
          ? indexes['body']!
          : hasDate
          ? 4
          : 3,
      'recipient': (indexes['recipient'] ?? -1) >= 0
          ? indexes['recipient']!
          : hasDate
          ? 5
          : 4,
      'signature': (indexes['signature'] ?? -1) >= 0
          ? indexes['signature']!
          : hasDate
          ? 6
          : 5,
      'notes': (indexes['notes'] ?? -1) >= 0
          ? indexes['notes']!
          : hasDate
          ? 7
          : 6,
    };

    for (var offset = headerIndex + 1; offset < matrix.length; offset++) {
      final row = matrix[offset];
      final body = _cell(row, fallback['body']!);
      final sender = _cell(row, fallback['sender']!);
      final recipient = _cell(row, fallback['recipient']!);
      final notes = _cell(row, fallback['notes']!);
      if (body.isEmpty &&
          sender.isEmpty &&
          recipient.isEmpty &&
          notes.isEmpty) {
        continue;
      }
      final rowNumber = offset + 1;
      if (body.length < 3) {
        skippedRows++;
        issues.add(
          TelegramExcelIssue(
            rowNumber: rowNumber,
            sheetName: sheetName,
            reason: 'نص البرقية فارغ أو أقصر من الحد الأدنى.',
            value: body,
          ),
        );
        continue;
      }
      final originalSerial = _cell(row, fallback['serial']!);
      final date = _cell(row, fallback['date']!);
      final time = _cell(row, fallback['time']!);
      final serialKey = '$direction|${_normalized(originalSerial)}';
      final fingerprint = [
        direction,
        _normalized(originalSerial),
        _normalized(date),
        _normalized(time),
        _normalized(body),
      ].join('|');
      if (!fingerprints.add(fingerprint) ||
          (originalSerial.isNotEmpty && !serials.add(serialKey))) {
        duplicateRows++;
        issues.add(
          TelegramExcelIssue(
            rowNumber: rowNumber,
            sheetName: sheetName,
            reason: 'صف مكرر داخل الملف وتم استبعاده تلقائياً.',
            value: originalSerial.isEmpty
                ? body.substring(0, body.length > 80 ? 80 : body.length)
                : originalSerial,
          ),
        );
        continue;
      }
      if (originalSerial.isEmpty) serials.add(serialKey);
      rows.add(
        TelegramExcelRow(
          originalSerial: originalSerial,
          time: time,
          sender: sender,
          date: date,
          body: body,
          recipient: recipient,
          signature: _cell(row, fallback['signature']!),
          notes: notes,
          sheetName: direction,
        ),
      );
    }
  }

  if (rows.isEmpty) {
    throw const FormatException(
      'لم يعثر النظام على صفوف برقيات صالحة. تأكد من وجود عمود نص البرقية وعدم رفع قالب فارغ.',
    );
  }
  if (rows.length > 1000) {
    throw const FormatException(
      'الحد الأقصى للاستيراد في العملية الواحدة هو 1000 برقية.',
    );
  }
  return TelegramExcelParseResult(
    rows: rows,
    skippedRows: skippedRows,
    duplicateRows: duplicateRows,
    issues: issues.take(100).toList(),
    sheets: workbook.tables.keys.toList(),
  );
}
