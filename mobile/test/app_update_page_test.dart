import 'package:flutter_test/flutter_test.dart';

void main() {
  test('update version comparison treats higher patch versions as newer', () {
    const current = '1.0.0';
    const latest = '1.0.1';
    expect(_compareVersions(latest, current), greaterThan(0));
    expect(_compareVersions(current, latest), lessThan(0));
    expect(_compareVersions(current, current), 0);
  });
}

int _compareVersions(String latest, String current) {
  List<int> parse(String value) => value
      .split('+')
      .first
      .split('-')
      .first
      .split('.')
      .map((part) => int.tryParse(part) ?? 0)
      .toList();

  final a = parse(latest);
  final b = parse(current);
  final length = a.length > b.length ? a.length : b.length;
  for (var i = 0; i < length; i++) {
    final left = i < a.length ? a[i] : 0;
    final right = i < b.length ? b[i] : 0;
    if (left != right) return left.compareTo(right);
  }
  return 0;
}
