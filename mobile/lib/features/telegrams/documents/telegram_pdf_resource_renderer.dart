import 'dart:typed_data';

import 'package:flutter/services.dart';

/// A binary image resource referenced by a document through a private URL.
///
/// The image bytes are transferred separately from HTML and are never
/// serialized into a data URL or written to a broadly accessible file path.
class TelegramPdfImageResource {
  const TelegramPdfImageResource({
    required this.bytes,
    required this.mimeType,
  });

  final Uint8List bytes;
  final String mimeType;

  Map<String, Object> toPlatformMap(String id) => <String, Object>{
    'id': id,
    'mimeType': mimeType,
    'bytes': bytes,
  };
}

/// Calls the native WebView PDF renderer with a per-render resource registry.
class TelegramPdfResourceRenderer {
  const TelegramPdfResourceRenderer();

  static const MethodChannel _channel = MethodChannel(
    'com.police_telegrams/telegram_pdf_resources',
  );

  Future<Uint8List> renderPdf({
    required String html,
    required Map<String, TelegramPdfImageResource> resources,
  }) async {
    if (html.trim().isEmpty) {
      throw ArgumentError.value(html, 'html', 'HTML must not be empty.');
    }

    final resourcePayload = resources.entries
        .map((entry) => entry.value.toPlatformMap(entry.key))
        .toList(growable: false);

    final result = await _channel.invokeMethod<Uint8List>(
      'renderHtmlToPdf',
      <String, Object>{
        'html': html,
        'resources': resourcePayload,
      },
    );

    if (result == null || result.isEmpty) {
      throw StateError('تعذر إنشاء ملف الوثيقة على الجهاز.');
    }
    return result;
  }
}
