import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/offline_first.dart';

void main() {
  test('allows an offline attachment up to exactly 2 MiB', () {
    expect(isOfflineAttachmentSizeAllowed(2 * 1024 * 1024), isTrue);
  });

  test('rejects an offline attachment larger than 2 MiB', () {
    expect(isOfflineAttachmentSizeAllowed(2 * 1024 * 1024 + 1), isFalse);
  });

  test('rejects a negative offline attachment size', () {
    expect(isOfflineAttachmentSizeAllowed(-1), isFalse);
  });
}
