import 'dart:typed_data';
import 'dart:ui' as ui;

const _maxSourceLogoBytes = 5 * 1024 * 1024;
const _maxStoredLogoBytes = 2621440;
const _initialMaxLogoDimension = 1600;
const _minimumLogoDimension = 256;

/// Produces a PNG logo payload that fits the server's 2.5 MiB decoded limit.
///
/// PNG output preserves transparency for agency marks. JPEG inputs are
/// normalized to PNG as well, so the upload MIME type always matches bytes.
Future<Uint8List> prepareOrganizationLogoBytes(Uint8List source) async {
  if (source.isEmpty) {
    throw ArgumentError('ملف الشعار فارغ.');
  }
  if (source.length > _maxSourceLogoBytes) {
    throw ArgumentError('حجم ملف الشعار الأصلي يجب ألا يتجاوز 5 ميغابايت.');
  }

  final sourceCodec = await ui.instantiateImageCodec(source);
  late final int sourceWidth;
  late final int sourceHeight;
  try {
    final frame = await sourceCodec.getNextFrame();
    sourceWidth = frame.image.width;
    sourceHeight = frame.image.height;
    frame.image.dispose();
  } finally {
    sourceCodec.dispose();
  }

  if (sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      sourceWidth > 12000 ||
      sourceHeight > 12000 ||
      sourceWidth * sourceHeight > 40000000) {
    throw ArgumentError('أبعاد صورة الشعار كبيرة جدًا؛ اختر صورة أصغر.');
  }

  var maxDimension = _initialMaxLogoDimension;
  while (true) {
    final scale = (maxDimension / (sourceWidth > sourceHeight
            ? sourceWidth
            : sourceHeight))
        .clamp(0.0, 1.0);
    final targetWidth = (sourceWidth * scale).round().clamp(1, sourceWidth);
    final targetHeight = (sourceHeight * scale).round().clamp(1, sourceHeight);
    final codec = await ui.instantiateImageCodec(
      source,
      targetWidth: targetWidth,
      targetHeight: targetHeight,
      allowUpscaling: false,
    );
    try {
      final frame = await codec.getNextFrame();
      try {
        final data = await frame.image.toByteData(
          format: ui.ImageByteFormat.png,
        );
        if (data == null) {
          throw StateError('تعذر تجهيز شعار الجهة للرفع.');
        }
        final bytes = data.buffer.asUint8List(
          data.offsetInBytes,
          data.lengthInBytes,
        );
        if (bytes.length <= _maxStoredLogoBytes) return bytes;
      } finally {
        frame.image.dispose();
      }
    } finally {
      codec.dispose();
    }

    if (maxDimension <= _minimumLogoDimension) {
      throw StateError('تعذر ضغط الشعار إلى الحد المسموح؛ اختر صورة أصغر.');
    }
    maxDimension = (maxDimension * 0.75).floor();
    if (maxDimension < _minimumLogoDimension) {
      maxDimension = _minimumLogoDimension;
    }
  }
}
