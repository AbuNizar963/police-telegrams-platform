import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/organizations/organization_logo_upload.dart';

Future<Uint8List> _transparentPng() async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  final paint = ui.Paint()..color = const ui.Color(0xFFFF0000);
  canvas.drawRect(const ui.Rect.fromLTWH(0, 0, 8, 8), paint);
  final picture = recorder.endRecording();
  final image = await picture.toImage(16, 16);
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  } finally {
    image.dispose();
    picture.dispose();
  }
}

void main() {
  test('normalizes agency logos to PNG without removing transparency', () async {
    final result = await prepareOrganizationLogoBytes(await _transparentPng());
    expect(result.length, lessThanOrEqualTo(2621440));
    expect(result.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10]);

    final codec = await ui.instantiateImageCodec(result);
    try {
      final frame = await codec.getNextFrame();
      try {
        final rgba = await frame.image.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        expect(rgba, isNotNull);
        final bytes = rgba!.buffer.asUint8List(
          rgba.offsetInBytes,
          rgba.lengthInBytes,
        );
        expect(bytes[3], 255);
        expect(bytes[(15 * 16 + 15) * 4 + 3], 0);
      } finally {
        frame.image.dispose();
      }
    } finally {
      codec.dispose();
    }
  });

  test('rejects source logos larger than five MiB before decoding', () async {
    await expectLater(
      prepareOrganizationLogoBytes(Uint8List(5 * 1024 * 1024 + 1)),
      throwsArgumentError,
    );
  });
}
