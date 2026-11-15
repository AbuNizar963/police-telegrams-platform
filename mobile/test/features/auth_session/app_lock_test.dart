import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/auth_session/app_lock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('locks PIN verification after five consecutive failures', () async {
    await AppLockService.savePin('2468');

    for (var attempt = 0; attempt < 4; attempt++) {
      expect(await AppLockService.verifyPin('0000'), isFalse);
      expect(await AppLockService.pinLockRemaining(), Duration.zero);
    }

    expect(await AppLockService.verifyPin('0000'), isFalse);
    expect(await AppLockService.pinLockRemaining(), isNot(Duration.zero));

    // A correct PIN cannot bypass an active lockout.
    expect(await AppLockService.verifyPin('2468'), isFalse);
  });

  test('a successful PIN resets the accumulated failure count', () async {
    await AppLockService.savePin('2468');

    for (var attempt = 0; attempt < 4; attempt++) {
      expect(await AppLockService.verifyPin('0000'), isFalse);
    }

    expect(await AppLockService.verifyPin('2468'), isTrue);

    for (var attempt = 0; attempt < 4; attempt++) {
      expect(await AppLockService.verifyPin('0000'), isFalse);
      expect(await AppLockService.pinLockRemaining(), Duration.zero);
    }

    expect(await AppLockService.verifyPin('0000'), isFalse);
    expect(await AppLockService.pinLockRemaining(), isNot(Duration.zero));
  });

  test('rejects PIN values that are not exactly four digits', () async {
    await expectLater(
      AppLockService.savePin('123'),
      throwsA(isA<FormatException>()),
    );
    await expectLater(
      AppLockService.savePin('12a4'),
      throwsA(isA<FormatException>()),
    );
  });
}
