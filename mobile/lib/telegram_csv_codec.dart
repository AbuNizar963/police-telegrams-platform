/// CSV serialization and import validation for the mobile telegram ledger.
///
/// This codec is independent of Flutter so edge cases can be tested without a
/// device or a platform file picker.
class TelegramCsvCodec {
  TelegramCsvCodec._();

  static const int maxImportRows = 1000;

  static String encodeRows(List<List<String>> rows) {
    final encoded = rows
        .map((row) => row.map(_escapeCell).join(','))
        .join('\r\n');
    return '\uFEFF$encoded\r\n';
  }

  static String _escapeCell(String value) =>
      '"' + value.replaceAll('"', '""') + '"';

  static CsvImportResult parseImport(String source) {
    final matrix = _decodeRows(source.replaceFirst('\uFEFF', ''));
    if (matrix.isEmpty) {
      throw const FormatException('ملف CSV فارغ.');
    }

    final headers = matrix.first.map(_normalizeHeader).toList();
    String getCell(List<String> row, List<String> aliases) {
      for (final alias in aliases) {
        final index = headers.indexOf(alias);
        if (index >= 0 && index < row.length) {
          return row[index].trim();
        }
      }
      return '';
    }

    final rows = <Map<String, dynamic>>[];
    var invalidRows = 0;

    for (final cells in matrix.skip(1)) {
      if (cells.every((cell) => cell.trim().isEmpty)) continue;

      final body = getCell(cells, const [
        'body', 'text', 'content', 'المتن', 'نص البرقية', 'النص',
      ]);
      if (body.length < 3) {
        invalidRows++;
        continue;
      }

      final direction = getCell(cells, const [
        'sheetname', 'direction', 'الاتجاه', 'نوع البرقية',
      ]).toLowerCase();

      rows.add({
        'originalSerial': getCell(cells, const [
          'originalserial', 'serial', 'serialnumber', 'الرقم',
          'الرقم الأصلي', 'رقم البرقية',
        ]),
        'time': getCell(cells, const ['time', 'الوقت']),
        'sender': getCell(cells, const [
          'sender', 'creator', 'المرسل', 'اسم المرسل',
        ]),
        'date': getCell(cells, const ['date', 'التاريخ']),
        'body': body,
        'recipient': getCell(cells, const [
          'recipient', 'receiver', 'المستلم', 'الجهة المستلمة',
        ]),
        'signature': getCell(cells, const ['signature', 'التوقيع']),
        'notes': getCell(cells, const [
          'notes', 'workflowreason', 'ملاحظات', 'الملاحظات',
        ]),
        'sheetName':
            direction.contains('وارد') || direction.contains('incoming')
                ? 'وارد'
                : 'صادر',
      });
    }

    final cappedRows = rows.take(maxImportRows).toList(growable: false);
    return CsvImportResult(
      rows: cappedRows,
      invalidRows: invalidRows + rows.length - cappedRows.length,
    );
  }

  static String _normalizeHeader(String value) =>
      value.trim().replaceFirst('\uFEFF', '').toLowerCase();

  static List<List<String>> _decodeRows(String source) {
    final rows = <List<String>>[];
    var row = <String>[];
    final cell = StringBuffer();
    var quoted = false;
    var quoteClosed = false;

    void finishCell() {
      row.add(cell.toString());
      cell.clear();
      quoteClosed = false;
    }

    void finishRow() {
      finishCell();
      if (row.any((value) => value.isNotEmpty) || rows.isNotEmpty) {
        rows.add(row);
      }
      row = <String>[];
    }

    for (var index = 0; index < source.length; index++) {
      final char = source[index];

      if (quoted) {
        if (char == '"') {
          if (index + 1 < source.length && source[index + 1] == '"') {
            cell.write('"');
            index++;
          } else {
            quoted = false;
            quoteClosed = true;
          }
        } else {
          cell.write(char);
        }
        continue;
      }

      if (quoteClosed) {
        if (char == ',') {
          finishCell();
        } else if (char == '\n' || char == '\r') {
          if (char == '\r' &&
              index + 1 < source.length &&
              source[index + 1] == '\n') {
            index++;
          }
          finishRow();
        } else if (char.trim().isEmpty) {
          // Permit harmless spaces between a closing quote and delimiter.
        } else {
          throw const FormatException(
            'تنسيق CSV غير صالح: توجد بيانات بعد إغلاق حقل مقتبس.',
          );
        }
        continue;
      }

      if (char == '"' && cell.isEmpty) {
        quoted = true;
      } else if (char == '"') {
        throw const FormatException(
          'تنسيق CSV غير صالح: علامة اقتباس داخل حقل غير مقتبس.',
        );
      } else if (char == ',') {
        finishCell();
      } else if (char == '\n' || char == '\r') {
        if (char == '\r' &&
            index + 1 < source.length &&
            source[index + 1] == '\n') {
          index++;
        }
        finishRow();
      } else {
        cell.write(char);
      }
    }

    if (quoted) {
      throw const FormatException('تنسيق CSV غير صالح: حقل مقتبس لم يُغلق.');
    }
    if (cell.isNotEmpty || row.isNotEmpty || quoteClosed) finishRow();
    return rows;
  }
}

class CsvImportResult {
  const CsvImportResult({
    required this.rows,
    required this.invalidRows,
  });

  final List<Map<String, dynamic>> rows;
  final int invalidRows;
}
