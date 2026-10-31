import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_native_html_to_pdf/flutter_native_html_to_pdf.dart';
import 'package:printing/printing.dart';
import 'package:qr/qr.dart';
import 'package:share_plus/share_plus.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'api.dart';
import 'organization_logo_resolution.dart';
import 'telegram_display.dart';
import 'telegram_report_labels.dart';
import 'toast.dart';

const _documentPageWidth = 794;
const _documentPageHeight = 1123;
const _documentMarginMm = 12.7;
const _documentPreviewDpi = 150.0;
const _documentImageExportDpi = 300.0;
// Keep the Flutter document watermark identical to the web export: a dense
// full-page 10 by 34 pattern with the same spacing and restrained ink.
const _ministryWatermarkColumns = 10;
const _ministryWatermarkRows = 34;
// Half-centimetre horizontal and vertical separation between repetitions.
const _ministryWatermarkGapCss = '5mm';
const _documentFooterPersonIcon = '''<svg class="footer-icon" data-icon="person" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
  <circle cx="12" cy="8" r="3.5" />
  <path d="M5 21c.7-4 3.1-6 7-6s6.3 2 7 6" />
</svg>''';
const _documentFooterLocationIcon = '''<svg class="footer-icon" data-icon="location" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
  <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
  <circle cx="12" cy="10" r="2.5" />
</svg>''';
const _documentFooterCalendarIcon = '''<svg class="footer-icon" data-icon="calendar" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
  <rect x="3.5" y="5" width="17" height="16" rx="2" />
  <path d="M16 3v4M8 3v4M3.5 10h17" />
</svg>''';

// The API also keeps a persistent, revalidated file cache. This small
// process cache avoids decoding the same organization logo again when an
// officer opens several telegrams during one session.
final Map<String, String> _officialLogoDataUrlCache = <String, String>{};

@visibleForTesting
Future<Uint8List> normalizeOfficialDocumentLogo(Uint8List bytes) async {
  // Decode at the source resolution. The previous forced 600x600 decode
  // distorted non-square logos and discarded detail from larger originals.
  final codec = await ui.instantiateImageCodec(bytes);
  try {
    final frame = await codec.getNextFrame();
    try {
      final data = await frame.image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('تعذر تجهيز شعار الوثيقة.');
      return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
    } finally {
      frame.image.dispose();
    }
  } finally {
    codec.dispose();
  }
}

/// Rendering boundary for the official document.
abstract interface class OfficialTelegramDocumentRenderer {
  Future<Uint8List> renderPdf(String html);
  Future<Uint8List> renderPreview(Uint8List pdfBytes);
  Future<Uint8List> renderHighResolutionImage(Uint8List pdfBytes);
}

class NativeOfficialTelegramDocumentRenderer
    implements OfficialTelegramDocumentRenderer {
  const NativeOfficialTelegramDocumentRenderer();

  @override
  Future<Uint8List> renderPdf(String html) async => Uint8List.fromList(
    await HtmlToPdfConverter().convertHtmlToPdfBytes(
      html: html,
      pageSize: PdfPageSize.a4,
    ),
  );

  @override
  Future<Uint8List> renderPreview(Uint8List pdfBytes) =>
      _renderFirstPage(pdfBytes, dpi: _documentPreviewDpi);

  @override
  Future<Uint8List> renderHighResolutionImage(Uint8List pdfBytes) =>
      _renderFirstPage(pdfBytes, dpi: _documentImageExportDpi);

  Future<Uint8List> _renderFirstPage(
    Uint8List pdfBytes, {
    required double dpi,
  }) async {
    final firstPage = await Printing.raster(
      pdfBytes,
      pages: const [0],
      dpi: dpi,
    ).first;
    return firstPage.toPng();
  }
}

class OfficialTelegramDocumentRendererScope extends InheritedWidget {
  const OfficialTelegramDocumentRendererScope({
    super.key,
    required this.renderer,
    required super.child,
  });

  final OfficialTelegramDocumentRenderer renderer;

  static OfficialTelegramDocumentRenderer? maybeOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<
            OfficialTelegramDocumentRendererScope
          >()
          ?.renderer;

  @override
  bool updateShouldNotify(OfficialTelegramDocumentRendererScope oldWidget) =>
      renderer != oldWidget.renderer;
}

bool _hasValidPlatformDocumentSettingsContract(Map result) {
  final opacity = result['watermarkOpacityPercent'];
  final color = result['headerDividerColor'];
  return result['showMinistryWatermarkText'] is bool &&
      result['showVerificationQr'] is bool &&
      opacity is int &&
      opacity >= 0 &&
      opacity <= 60 &&
      color is String &&
      RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color);
}

class OfficialTelegramDocumentPage extends StatefulWidget {
  const OfficialTelegramDocumentPage({
    super.key,
    required this.api,
    required this.telegramId,
    this.onEdit,
    this.onDelete,
    this.onSubmitForReview,
    this.canReissue = false,
  });

  final PoliceApi api;
  final int telegramId;
  final Future<void> Function()? onEdit;
  final Future<void> Function()? onDelete;
  final Future<void> Function()? onSubmitForReview;
  final bool canReissue;

  @override
  State<OfficialTelegramDocumentPage> createState() =>
      _OfficialTelegramDocumentPageState();
}

class _OfficialTelegramDocumentPageState
    extends State<OfficialTelegramDocumentPage> {
  bool loading = true;
  bool busy = false;
  double _progress = 0;
  Timer? _progressTimer;
  String? error;
  Uint8List? preview;
  Map<String, dynamic>? telegram;
  Map<String, dynamic>? settings;
  List<Map<String, dynamic>> versions = <Map<String, dynamic>>[];
  int? selectedVersionNumber;
  bool historicalIdentityUnavailable = false;
  String? documentHtml;
  OfficialTelegramDocumentRenderer _renderer =
      const NativeOfficialTelegramDocumentRenderer();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _renderer =
        OfficialTelegramDocumentRendererScope.maybeOf(context) ??
        const NativeOfficialTelegramDocumentRenderer();
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({int? versionNumber}) async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
        preview = null;
        historicalIdentityUnavailable = false;
      });
    }
    try {
      final results = await Future.wait<dynamic>([
        widget.api.call('telegrams.get', input: {'id': widget.telegramId}),
        widget.api.call('settings.get'),
        widget.api.call('organizations.routingDirectory'),
        widget.api.call(
          'platformDocumentSettings.get',
          allowOfflineCache: false,
        ),
      ]);
      final telegramData = Map<String, dynamic>.from(results[0] as Map);
      final settingsData = results[1] is Map
          ? Map<String, dynamic>.from(results[1] as Map)
          : <String, dynamic>{};
      if (results[3] is! Map ||
          !_hasValidPlatformDocumentSettingsContract(results[3] as Map)) {
        throw Exception('تعذر قراءة إعدادات وثيقة النظام.');
      }
      final platformDocumentSettings = Map<String, dynamic>.from(
        results[3] as Map,
      );

      List<Map<String, dynamic>> versionsData = <Map<String, dynamic>>[];
      var versionHistoryAvailable = false;
      try {
        final versionResult = await widget.api.call(
          'telegrams.versions',
          input: {'telegramId': widget.telegramId},
          allowOfflineCache: false,
        );
        versionHistoryAvailable = true;
        if (versionResult is List) {
          versionsData = versionResult
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
        }
      } catch (_) {
        throw Exception(
          'تعذر تحميل سجل إصدارات البرقية؛ تحقق من الاتصال وأعد المحاولة.',
        );
      }
      final requestedVersionNumber = versionNumber ?? selectedVersionNumber;
      if (requestedVersionNumber != null &&
          (!versionHistoryAvailable ||
              !versionsData.any(
                (item) => item['versionNumber'] == requestedVersionNumber,
              ))) {
        throw Exception('تعذر تحميل الإصدار التاريخي المطلوب؛ أعد المحاولة.');
      }
      final activeVersion = requestedVersionNumber == null
          ? (versionsData.isNotEmpty ? versionsData.last : <String, dynamic>{})
          : versionsData.firstWhere(
              (item) => item['versionNumber'] == requestedVersionNumber,
            );
      final hasSelectedVersion = activeVersion.isNotEmpty;
      final snapshotLetterhead = activeVersion['snapshot'] is Map
          ? (activeVersion['snapshot'] as Map)['letterhead']
          : null;
      final hasHistoricalIdentity =
          snapshotLetterhead is Map &&
          snapshotLetterhead['organizationName'] is String &&
          snapshotLetterhead['departmentName'] is String &&
          snapshotLetterhead['unitChiefRank'] is String &&
          snapshotLetterhead['unitChiefName'] is String;
      if (hasSelectedVersion && activeVersion['snapshot'] is Map) {
        telegramData.addAll(
          Map<String, dynamic>.from(activeVersion['snapshot'] as Map),
        );
      }

      final logoOrganizationId =
          resolveOrganizationLogoId(
            accountOrganizationId: settingsData['organizationId'],
            currentOrganizationId: telegramData['currentOrganizationId'],
            ownerOrganizationId: telegramData['organizationId'],
          ) ??
          '';
      if (!hasSelectedVersion) {
        // Legacy telegrams without a saved version keep the verified current
        // organization logo fallback. A version with no historical logo must
        // remain logo-less rather than borrowing today's logo.
        final settingsOrganizationId =
            resolveOrganizationLogoId(
              accountOrganizationId: settingsData['organizationId'],
            ) ??
            '';
        final savedSettingsLogo = _value(settingsData['logoUrl'], fallback: '');
        settingsData['logoUrl'] =
            logoOrganizationId.isNotEmpty &&
                settingsOrganizationId == logoOrganizationId &&
                savedSettingsLogo.isNotEmpty
            ? savedSettingsLogo
            : null;

        if (logoOrganizationId.isNotEmpty) {
          try {
            final organizationSettings = await widget.api.call(
              'organizations.logo',
              input: {'organizationId': logoOrganizationId},
            );
            if (organizationSettings is Map &&
                resolveOrganizationLogoId(
                      accountOrganizationId:
                          organizationSettings['organizationId'],
                    ) ==
                    logoOrganizationId) {
              final scopedLogo = organizationSettings['logoUrl']
                  ?.toString()
                  .trim();
              if (scopedLogo != null && scopedLogo.isNotEmpty) {
                settingsData['logoUrl'] = scopedLogo;
              }
            }
          } catch (_) {
            // Keep the verified account-settings fallback when available.
          }
        }
      }

      final routingDirectory = results[2] is List
          ? (results[2] as List)
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
          : <Map<String, dynamic>>[];

      // Fonts and the optional organization logo are independent resources.
      // Load them together so preview generation does not wait for them in series.
      final resources = await Future.wait<Object?>([
        _loadFontDataUrls(),
        hasSelectedVersion
            ? _loadHistoricalLogoDataUrl(
                activeVersion,
                _value(telegramData['organizationId']),
              )
            : _loadLogoDataUrl(settingsData['logoUrl'], logoOrganizationId),
      ]);
      final fontDataUrls = resources[0] as Map<int, String>;
      final logoDataUrl = resources[1] as String?;
      final token = _value(telegramData['verificationToken']);
      final verificationUrl = Uri.parse(widget.api.baseUrl)
          .resolve('/verify/${Uri.encodeComponent(token)}')
          .toString();
      var referenceLinks = <Map<String, dynamic>>[];
      final importNotes = _value(telegramData['importNotes']).trim();
      if (importNotes.isNotEmpty) {
        try {
          final resolved = await widget.api.call(
            'telegrams.resolveImportReferences',
            input: {'notes': importNotes},
          );
          if (resolved is List) {
            referenceLinks = resolved
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList();
          }
        } catch (_) {
          // Older deployments still show the original note text without links.
        }
      }
      final html = buildOfficialTelegramHtml(
        telegram: telegramData,
        settings: settingsData,
        platformDocumentSettings: platformDocumentSettings,
        routingDirectory: routingDirectory,
        verificationUrl: verificationUrl,
        referenceLinks: referenceLinks,
        fontDataUrls: fontDataUrls,
        logoDataUrl: logoDataUrl,
      );
      // The same locally generated PDF powers preview, print, save, and
      // sharing. Tests can replace the native renderer through the scope.
      final pdfBytes = await _renderer.renderPdf(html);
      if (pdfBytes.isEmpty) {
        throw Exception('تعذر إنشاء ملف الوثيقة على الجهاز.');
      }
      final image = await _renderer.renderPreview(pdfBytes);
      if (image.isEmpty) {
        throw Exception('تعذر تجهيز معاينة الوثيقة على الجهاز.');
      }
      if (!mounted) return;
      setState(() {
        telegram = telegramData;
        settings = settingsData;
        versions = versionsData;
        selectedVersionNumber = hasSelectedVersion
            ? activeVersion['versionNumber'] as int?
            : null;
        historicalIdentityUnavailable =
            hasSelectedVersion && !hasHistoricalIdentity;
        documentHtml = html;
        preview = image;
        loading = false;
      });
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        error = exception.toString().replaceFirst('Exception: ', '');
        loading = false;
      });
    }
  }

  Future<Map<int, String>> _loadFontDataUrls() async {
    const fontWeights = [400, 500, 600, 700];
    final entries = await Future.wait(
      fontWeights.map((weight) async {
        final data = await rootBundle.load('assets/fonts/cairo-$weight.ttf');
        final bytes = data.buffer.asUint8List(
          data.offsetInBytes,
          data.lengthInBytes,
        );
        return MapEntry(weight, 'data:font/ttf;base64,${base64Encode(bytes)}');
      }),
    );
    return Map<int, String>.fromEntries(entries);
  }

  Future<String?> _loadHistoricalLogoDataUrl(
    Map<String, dynamic> version,
    String organizationId,
  ) async {
    final url = _value(version['logoUrl'], fallback: '');
    if (url.isEmpty || organizationId.isEmpty) return null;
    final cacheKey = '$organizationId\n$url';
    final cached = _officialLogoDataUrlCache[cacheKey];
    if (cached != null) return cached;

    final bytes = await widget.api.fetchImageAsset(url);
    if (bytes == null || bytes.isEmpty) {
      throw Exception('تعذر تحميل شعار الإصدار التاريخي للبرقية.');
    }
    final normalized = await normalizeOfficialDocumentLogo(bytes);
    final dataUrl = 'data:image/png;base64,${base64Encode(normalized)}';
    _officialLogoDataUrlCache[cacheKey] = dataUrl;
    return dataUrl;
  }

  Future<String?> _loadLogoDataUrl(
    Object? source,
    String organizationId,
  ) async {
    final url = _value(source, fallback: '');
    if (url.isEmpty || organizationId.isEmpty) return null;
    final cacheKey = '$organizationId\n$url';
    final cached = _officialLogoDataUrlCache[cacheKey];
    if (cached != null) return cached;
    try {
      final bytes = await widget.api.fetchOrganizationLogo(
        organizationId: organizationId,
        source: url,
      );
      if (bytes == null || bytes.isEmpty) return null;
      final normalized = await normalizeOfficialDocumentLogo(bytes);
      final dataUrl = 'data:image/png;base64,${base64Encode(normalized)}';
      _officialLogoDataUrlCache[cacheKey] = dataUrl;
      return dataUrl;
    } catch (_) {
      // A missing or unreadable organization logo must remain absent; never
      // substitute a default seal or watermark.
      return null;
    }
  }

  String get _fileBaseName {
    final serial = _displaySerial == '—' ? 'telegram' : _displaySerial;
    final safe = serial.replaceAll(RegExp(r'[\\/:*?"<>|\u0000-\u001f]'), '-');
    return 'telegram-$safe';
  }

  String get _displaySerial =>
      getTelegramDisplaySerial(telegram ?? const {}, settings?['numberSystem']);

  Future<String> _recordDocumentOutput(String operation, String format) async {
    final result = await widget.api.call(
      'telegrams.recordDocumentOutput',
      mutation: true,
      allowOfflineCache: false,
      input: {
        'id': widget.telegramId,
        'operation': operation,
        'format': format,
      },
    );
    if (result is Map) {
      final occurredAt = result['occurredAt']?.toString().trim();
      if (occurredAt != null && DateTime.tryParse(occurredAt) != null) {
        return occurredAt;
      }
    }
    throw Exception('لم يصل وقت الإخراج من الخادم. أعد المحاولة.');
  }

  String _htmlWithOutputTimestamp(String occurredAt) {
    final html = documentHtml;
    if (html == null) throw Exception('تعذر تجهيز قالب الوثيقة.');
    const placeholder =
        '<span class="footer-output-time">يُحدَّد عند الإخراج</span>';
    if (!html.contains(placeholder)) {
      throw Exception('تعذر تحديث وقت إخراج الوثيقة. أعد فتحها ثم حاول.');
    }
    final formatted = _formatConfiguredHeaderDateTime(
      occurredAt,
      settings ?? const <String, dynamic>{},
    );
    return html.replaceFirst(
      placeholder,
      '<span class="footer-output-time">${_escapeHtml(formatted)}</span>',
    );
  }

  Future<Uint8List> _renderOutputPdf(String operation, String format) async {
    final occurredAt = await _recordDocumentOutput(operation, format);
    final bytes = await _renderer.renderPdf(
      _htmlWithOutputTimestamp(occurredAt),
    );
    if (bytes.isEmpty) {
      throw Exception('تعذر إنشاء ملف الوثيقة على الجهاز.');
    }
    if (mounted) {
      try {
        final updatedPreview = await _renderer.renderPreview(bytes);
        if (mounted) setState(() => preview = updatedPreview);
      } catch (_) {
        // A preview refresh must not cancel a valid export or print request.
      }
    }
    return bytes;
  }

  Future<Uint8List> _renderOutputImage() async {
    final pdfBytes = await _renderOutputPdf('download', 'png');
    final image = await _renderer.renderHighResolutionImage(pdfBytes);
    if (image.isEmpty) {
      throw Exception('تعذر تجهيز صورة الوثيقة بدقة الطباعة.');
    }
    return image;
  }

  Future<void> _perform(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      _progress = 3;
    });
    _progressTimer?.cancel();
    _progressTimer = Timer.periodic(const Duration(milliseconds: 350), (_) {
      if (mounted && busy) {
        setState(() {
          _progress = (_progress + (100 - _progress) * .12)
              .clamp(3, 92)
              .toDouble();
        });
      }
    });
    try {
      await action();
    } catch (exception) {
      if (!mounted) return;
      Toast.error(
        context,
        exception.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      _progressTimer?.cancel();
      if (mounted) {
        setState(() => _progress = 100);
        await Future<void>.delayed(const Duration(milliseconds: 650));
        if (mounted) setState(() => busy = false);
      }
    }
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    super.dispose();
  }

  Future<void> _selectVersion(int versionNumber) async {
    if (versionNumber == selectedVersionNumber) return;
    setState(() => selectedVersionNumber = versionNumber);
    await load(versionNumber: versionNumber);
  }

  Future<void> _reissue() async {
    if (!widget.canReissue || busy) return;
    final reasonController = TextEditingController();
    String? reasonError;
    final reason = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => Directionality(
          textDirection: TextDirection.rtl,
          child: AlertDialog(
            title: const Text('إعادة إصدار البرقية'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'سيُنشأ إصدار موثق جديد بالشعار الحالي، مع الاحتفاظ بنفس الرقم الرسمي والنسخ السابقة.',
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: reasonController,
                  minLines: 2,
                  maxLines: 4,
                  autofocus: true,
                  decoration: InputDecoration(
                    labelText: 'سبب إعادة الإصدار',
                    hintText: 'اكتب سبباً واضحاً (5 أحرف على الأقل)',
                    errorText: reasonError,
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () {
                  final value = reasonController.text.trim();
                  if (value.length < 5) {
                    setDialogState(
                      () => reasonError =
                          'سبب إعادة الإصدار مطلوب ويجب ألا يقل عن 5 أحرف.',
                    );
                    return;
                  }
                  Navigator.of(dialogContext).pop(value);
                },
                child: const Text('تأكيد إعادة الإصدار'),
              ),
            ],
          ),
        ),
      ),
    );
    reasonController.dispose();
    if (reason == null || !mounted) return;

    setState(() => busy = true);
    try {
      final result = await widget.api.call(
        'telegrams.reissue',
        mutation: true,
        input: {'id': widget.telegramId, 'reason': reason},
      );
      final newVersionNumber = result is Map
          ? result['versionNumber'] as int?
          : null;
      if (newVersionNumber == null) {
        throw Exception('لم يُرجع الخادم رقم الإصدار الجديد.');
      }
      await load(versionNumber: newVersionNumber);
      if (!mounted) return;
      Toast.success(
        context,
        'تم إنشاء الإصدار $newVersionNumber مع الاحتفاظ بالرقم الرسمي.',
      );
      if (result is Map &&
          (result['actionLogRecorded'] == false ||
              result['auditLogRecorded'] == false)) {
        Toast.warning(
          context,
          'تم حفظ الإصدار، لكن تعذر تسجيل أحد سجلات التدقيق الثانوية.',
        );
      }
    } catch (exception) {
      if (!mounted) return;
      Toast.error(
        context,
        exception.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _printPdf() => _perform(() async {
    final bytes = await _renderOutputPdf('print', 'pdf');
    await Printing.layoutPdf(
      name: '$_fileBaseName.pdf',
      onLayout: (_) async => bytes,
    );
  });

  Future<void> _savePdf() => _perform(() async {
    final bytes = await _renderOutputPdf('download', 'pdf');
    final path = await FilePicker.saveFile(
      dialogTitle: 'حفظ الوثيقة الرسمية',
      fileName: '$_fileBaseName.pdf',
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      bytes: bytes,
    );
    if (!mounted) return;
    if (path == null) {
      Toast.info(context, 'تم إلغاء حفظ الملف.');
    } else {
      Toast.success(context, 'تم حفظ الوثيقة.');
    }
  });

  Future<void> _sharePdf() => _perform(() async {
    final bytes = await _renderOutputPdf('download', 'pdf');
    await Printing.sharePdf(bytes: bytes, filename: '$_fileBaseName.pdf');
  });

  Future<void> _shareImage() => _perform(() async {
    final bytes = await _renderOutputImage();
    await SharePlus.instance.share(
      ShareParams(
        files: [
          XFile.fromData(
            bytes,
            name: '$_fileBaseName.png',
            mimeType: 'image/png',
          ),
        ],
        title: 'برقية ${_value(telegram?['subject'], fallback: '')}',
        text: _value(telegram?['subject'], fallback: ''),
      ),
    );
  });

  Future<void> _saveImage() => _perform(() async {
    final bytes = await _renderOutputImage();
    final path = await FilePicker.saveFile(
      dialogTitle: 'حفظ صورة الوثيقة الرسمية',
      fileName: '$_fileBaseName.png',
      type: FileType.custom,
      allowedExtensions: const ['png'],
      bytes: bytes,
    );
    if (!mounted) return;
    if (path == null) {
      Toast.info(context, 'تم إلغاء حفظ الصورة.');
    } else {
      Toast.success(context, 'تم حفظ الصورة.');
    }
  });

  Future<void> _attachFile() => _perform(() async {
    final result = await FilePicker.pickFiles(
      withData: true,
      type: FileType.custom,
      allowedExtensions: const [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'pdf',
        'mp3',
        'wav',
        'webm',
      ],
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    if (file.bytes == null || file.bytes!.isEmpty) {
      throw Exception('تعذر قراءة الملف المحدد.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw Exception('حجم المرفق يتجاوز 10 ميغابايت.');
    }
    final contentType = _attachmentContentType(file.extension);
    if (contentType == null) throw Exception('نوع الملف غير مدعوم.');
    await widget.api.call(
      'telegrams.uploadAttachment',
      mutation: true,
      input: {
        'telegramId': widget.telegramId,
        'fileName': file.name,
        'contentType': contentType,
        'base64': base64Encode(file.bytes!),
      },
    );
    if (mounted) {
      Toast.success(context, 'تم إرفاق الملف بالبرقية.');
    }
  });

  String? _attachmentContentType(String? extension) {
    switch ((extension ?? '').toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'webm':
        return 'audio/webm';
    }
    return null;
  }

  Future<void> _showLocation() async {
    final latitude = telegram?['gpsLatitude'];
    final longitude = telegram?['gpsLongitude'];
    final message = latitude == null || longitude == null
        ? 'لا يوجد موقع مسجل لهذه البرقية.'
        : 'إحداثيات الموقع: $latitude, $longitude';
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('موقع البرقية'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('إغلاق'),
          ),
        ],
      ),
    );
  }

  Widget _documentAction({
    required String label,
    required IconData icon,
    required VoidCallback? onPressed,
    bool primary = false,
    bool danger = false,
  }) {
    final foreground = danger || primary
        ? Colors.white
        : const Color(0xFF101C35);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: danger
              ? const Color(0xFFE33D3D)
              : primary
              ? const Color(0xFF10233F)
              : Colors.white,
          foregroundColor: foreground,
          side: BorderSide(
            color: danger
                ? const Color(0xFFE33D3D)
                : primary
                ? const Color(0xFF10233F)
                : const Color(0xFFD8DCE2),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8),
        ),
        icon: Icon(icon, size: 19),
        label: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            label,
            style: const TextStyle(fontFamily: 'Cairo', fontSize: 13),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leadingWidth: 0,
        leading: const SizedBox.shrink(),
        toolbarHeight: 88,
        titleSpacing: 8,
        backgroundColor: const Color(0xFFF8F7F2),
        foregroundColor: const Color(0xFF101C35),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _displaySerial,
              style: const TextStyle(
                fontFamily: 'Cairo',
                color: Color(0xFF6B7280),
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              _value(telegram?['subject'], fallback: 'عرض البرقية'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontFamily: 'Cairo',
                color: Color(0xFF111827),
                fontSize: 20,
                height: 1.2,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'إغلاق تفاصيل البرقية',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.close_rounded, size: 25),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: loading
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 14),
                  Text('جارٍ تجهيز معاينة الوثيقة الرسمية...'),
                ],
              ),
            )
          : error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.error_outline,
                      color: Colors.red,
                      size: 40,
                    ),
                    const SizedBox(height: 12),
                    Text(error!, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                  ],
                ),
              ),
            )
          : Column(
              children: [
                if (versions.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
                    child: DropdownButtonFormField<int>(
                      key: ValueKey(selectedVersionNumber),
                      initialValue: selectedVersionNumber,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'الإصدار المعروض',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      items: versions
                          .map(
                            (version) => DropdownMenuItem<int>(
                              value: version['versionNumber'] as int,
                              child: Text(
                                'الإصدار ${version['versionNumber']} · ${version['changeReason'] ?? ''}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: busy || loading
                          ? null
                          : (value) {
                              if (value != null) {
                                _selectVersion(value);
                              }
                            },
                    ),
                  ),
                if (versions.isEmpty || historicalIdentityUnavailable)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Text(
                          versions.isEmpty
                              ? 'لا توجد لقطة تاريخية محفوظة لهذه البرقية. الشعار المعروض هو شعار الجهة الحالي، ولا يمكن تأكيد أنه الشعار الأصلي عند الإصدار.'
                              : 'هذا الإصدار أُنشئ قبل حفظ بيانات الترويسة التاريخية. لا يمكن تأكيد اسم الجهة أو رتبة واسم رئيسها وقت الإصدار؛ المعروض هو الإعداد الحالي.',
                          textDirection: TextDirection.rtl,
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                    ),
                  ),
                Expanded(
                  child: Container(
                    color: const Color(0xFFF8F8F6),
                    alignment: Alignment.topCenter,
                    child: InteractiveViewer(
                      minScale: 1,
                      maxScale: 4,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                        child: Center(
                          child: Image.memory(
                            preview!,
                            fit: BoxFit.contain,
                            filterQuality: FilterQuality.high,
                            width: double.infinity,
                            semanticLabel: 'معاينة الوثيقة الرسمية للبرقية',
                            errorBuilder: (context, exception, stackTrace) =>
                                const Text('تعذر عرض معاينة الوثيقة.'),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                if (busy)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 6, 20, 2),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'جارٍ تجهيز الوثيقة',
                                style: TextStyle(
                                  color: Color(0xFF101C35),
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            Text(
                              '${_progress.round()}%',
                              textDirection: TextDirection.ltr,
                              style: const TextStyle(
                                color: Color(0xFF101C35),
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: LinearProgressIndicator(
                            value: _progress / 100,
                            minHeight: 7,
                            backgroundColor: const Color(0xFFE8E1D1),
                            color: const Color(0xFFD8C38E),
                          ),
                        ),
                      ],
                    ),
                  ),
                SafeArea(
                  top: false,
                  minimum: const EdgeInsets.fromLTRB(12, 7, 12, 8),
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFCFCFA),
                      borderRadius: BorderRadius.circular(26),
                      border: Border.all(color: const Color(0xFFD8DCE2)),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x0A182230),
                          blurRadius: 12,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Directionality(
                      textDirection: TextDirection.ltr,
                      child: GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                        childAspectRatio: 3.25,
                        children: [
                          if (widget.canReissue)
                            _documentAction(
                              label: busy ? 'جارٍ التجهيز...' : 'إعادة إصدار',
                              icon: Icons.history_edu_outlined,
                              primary: false,
                              onPressed: busy ? null : _reissue,
                            ),
                          _documentAction(
                            label: busy ? 'جارٍ التجهيز...' : 'طباعة',
                            icon: Icons.print_outlined,
                            primary: true,
                            onPressed: busy ? null : () => _printPdf(),
                          ),
                          _documentAction(
                            label: 'إرفاق ملف',
                            icon: Icons.attach_file,
                            onPressed: busy ? null : () => _attachFile(),
                          ),
                          _documentAction(
                            label: 'تنزيل كصورة',
                            icon: Icons.image_outlined,
                            onPressed: busy ? null : () => _saveImage(),
                          ),
                          _documentAction(
                            label: 'تنزيل PDF',
                            icon: Icons.picture_as_pdf_outlined,
                            onPressed: busy ? null : () => _savePdf(),
                          ),
                          _documentAction(
                            label: 'مشاركة صورة',
                            icon: Icons.share_outlined,
                            onPressed: busy ? null : () => _shareImage(),
                          ),
                          _documentAction(
                            label: 'مشاركة PDF',
                            icon: Icons.share_outlined,
                            onPressed: busy ? null : () => _sharePdf(),
                          ),
                          _documentAction(
                            label: 'تعديل البرقية',
                            icon: Icons.save_outlined,
                            onPressed: busy || widget.onEdit == null
                                ? null
                                : () => widget.onEdit!(),
                          ),
                          _documentAction(
                            label: 'الموقع',
                            icon: Icons.my_location_outlined,
                            onPressed: busy ? null : () => _showLocation(),
                          ),
                          _documentAction(
                            label: 'حذف نهائي',
                            icon: Icons.delete_outline,
                            danger: true,
                            onPressed: busy || widget.onDelete == null
                                ? null
                                : () => widget.onDelete!(),
                          ),
                          _documentAction(
                            label: 'إرسال للمراجعة',
                            icon: Icons.send_outlined,
                            onPressed: busy || widget.onSubmitForReview == null
                                ? null
                                : () => widget.onSubmitForReview!(),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
    ),
  );
}

/// Builds the same A4 document structure used by the web preview/exporter.
/// Text values are escaped before insertion because the server renders this
/// authenticated HTML in headless Chromium.
String buildOfficialTelegramHtml({
  required Map<String, dynamic> telegram,
  required Map<String, dynamic> settings,
  Map<String, dynamic> platformDocumentSettings = const {},
  required List<Map<String, dynamic>> routingDirectory,
  required String verificationUrl,
  List<Map<String, dynamic>> referenceLinks = const [],
  required Map<int, String> fontDataUrls,
  String? logoDataUrl,
  String? outputTimestamp,
}) {
  final numberSystem = settings['numberSystem'];
  final showVerificationQr =
      platformDocumentSettings['showVerificationQr'] != false;
  final showMinistryWatermarkText =
      platformDocumentSettings['showMinistryWatermarkText'] != false;
  final opacityValue =
      int.tryParse('${platformDocumentSettings['watermarkOpacityPercent']}') ??
      16;
  final watermarkOpacity = (opacityValue.clamp(0, 60) / 100).toStringAsFixed(2);
  final requestedDividerColor =
      platformDocumentSettings['headerDividerColor']?.toString() ?? '';
  final headerDividerColor =
      RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(requestedDividerColor)
      ? requestedDividerColor
      : '#b49a55';
  final letterhead = telegram['letterhead'] is Map
      ? Map<String, dynamic>.from(telegram['letterhead'] as Map)
      : <String, dynamic>{};
  final historicalOrganizationName = _value(
    letterhead['organizationName'],
    fallback: '',
  ).trim();
  final departmentName = _localizeDigits(
    _value(
      letterhead['departmentName'] ?? settings['departmentName'],
      fallback: 'قسم العمليات',
    ),
    numberSystem,
  );
  final senderOrganizationName = _localizeDigits(
    _value(telegram['senderOrganizationName'], fallback: 'الجهة المرسلة'),
    numberSystem,
  );
  final hierarchyById = <String, Map<String, dynamic>>{
    for (final organization in routingDirectory)
      _value(organization['id'], fallback: ''): organization,
  };
  final hierarchyNames = <String>[
    if (historicalOrganizationName.isNotEmpty) historicalOrganizationName,
  ];
  var hierarchyId = _value(
    telegram['currentOrganizationId'] ?? telegram['organizationId'],
    fallback: '',
  );
  final visited = <String>{};
  while (historicalOrganizationName.isEmpty &&
      hierarchyId.isNotEmpty &&
      visited.add(hierarchyId)) {
    final organization = hierarchyById[hierarchyId];
    if (organization == null) break;
    hierarchyNames.insert(0, _value(organization['name']));
    hierarchyId = _value(organization['parentOrganizationId'], fallback: '');
  }
  final hierarchyCandidates = hierarchyNames.isNotEmpty
      ? [...hierarchyNames]
      : [
          _value(
            letterhead['unitName'] ?? settings['unitName'],
            fallback: 'قيادة الأمن الداخلي',
          ),
          _value(settings['departmentName'], fallback: 'قسم العمليات'),
        ];
  if (!hierarchyCandidates.any(
    (name) =>
        _localizeDigits(name, numberSystem).trim() ==
        senderOrganizationName.trim(),
  )) {
    hierarchyCandidates.add(
      _value(telegram['senderOrganizationName'], fallback: ''),
    );
  }
  const fixedHeaderNames = {'الجمهورية العربية السورية', 'وزارة الداخلية'};
  final organizationHierarchy = hierarchyCandidates
      .where(
        (name) =>
            name.trim().isNotEmpty && !fixedHeaderNames.contains(name.trim()),
      )
      .map(
        (name) => '<p>${_escapeHtml(_localizeDigits(name, numberSystem))}</p>',
      )
      .join();

  final telegramDate = telegram['telegramDate'] ?? telegram['createdAt'];
  final documentOutputAt = outputTimestamp == null
      ? 'يُحدَّد عند الإخراج'
      : _formatConfiguredHeaderDateTime(outputTimestamp, settings);
  final headerCreatedAt = _formatConfiguredHeaderDateTime(
    telegramDate,
    settings,
  );
  final latitude = telegram['gpsLatitude'];
  final longitude = telegram['gpsLongitude'];
  final location = _localizeDigits(
    latitude != null && longitude != null
        ? '$latitude, $longitude'
        : 'غير محدد',
    numberSystem,
  );
  final displaySerial = getTelegramDisplaySerial(telegram, numberSystem);
  final importNotes = _value(telegram['importNotes']).trim();
  final referenceByKey = <String, Map<String, dynamic>>{};
  for (final reference in referenceLinks) {
    final serial = _value(reference['serial'])
        .replaceAllMapped(RegExp(r'[٠-٩۰-۹]'), (match) {
          const digits = '٠١٢٣٤٥٦٧٨٩';
          const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
          final character = match.group(0)!;
          final index = digits.indexOf(character);
          return index >= 0 ? '$index' : '${persianDigits.indexOf(character)}';
        });
    referenceByKey['${_value(reference['direction'])}|$serial'] = reference;
  }
  final importNotesMarkup = (() {
    if (importNotes.isEmpty) return '';
    final pattern = RegExp(r'ب\s*([وص])\s*([0-9٠-٩۰-۹]+)');
    final buffer = StringBuffer();
    var cursor = 0;
    for (final match in pattern.allMatches(importNotes)) {
      buffer.write(_escapeHtml(importNotes.substring(cursor, match.start)));
      final marker = match.group(1) ?? '';
      final serial = (match.group(2) ?? '').replaceAllMapped(
        RegExp(r'[٠-٩۰-۹]'),
        (digitMatch) {
          const digits = '٠١٢٣٤٥٦٧٨٩';
          const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
          final character = digitMatch.group(0)!;
          final index = digits.indexOf(character);
          return index >= 0 ? '$index' : '${persianDigits.indexOf(character)}';
        },
      );
      final direction = marker == 'و' ? 'incoming' : 'outgoing';
      final reference = referenceByKey['$direction|$serial'];
      final label = _escapeHtml(match.group(0) ?? '');
      final token = _value(reference?['verificationToken']);
      if (reference != null && token.isNotEmpty) {
        final href = Uri.parse(verificationUrl)
            .resolve('/verify/${Uri.encodeComponent(token)}')
            .toString();
        buffer.write(
          '<a href="${_escapeHtml(href)}" target="_blank" rel="noopener noreferrer">$label</a>',
        );
      } else {
        buffer.write(label);
      }
      cursor = match.end;
    }
    buffer.write(_escapeHtml(importNotes.substring(cursor)));
    // Original-record notes are retained in the data model for the pending
    // feature, but are intentionally hidden from official documents for now.
    return '';
  })();
  final outgoing =
      _value(telegram['organizationId'], fallback: '') ==
      _value(telegram['currentOrganizationId'], fallback: '');
  final documentType = outgoing ? 'برقية صادرة' : 'برقية واردة';
  final classification = _label(
    telegramClassificationLabels,
    telegram['classification'],
  );
  final priority = _label(telegramPriorityLabels, telegram['priority']);
  final category = _label(telegramCategoryLabels, telegram['category']);
  final status = _label(telegramStatusLabels, telegram['status']);
  final logo = logoDataUrl == null
      ? ''
      : '<img class="official-logo" src="${_escapeHtml(logoDataUrl)}" alt="الشعار الرسمي" />';
  final watermarkLogo = logoDataUrl == null
      ? ''
      : '<img class="watermark-logo" src="${_escapeHtml(logoDataUrl)}" alt="" />';
  final watermarkItems = showMinistryWatermarkText
      ? List<String>.filled(
          _ministryWatermarkColumns * _ministryWatermarkRows,
          '<span>وزارة الداخلية</span>',
        ).join()
      : '';
  final watermarkText = showMinistryWatermarkText
      ? '<div class="watermark-text-pattern" aria-hidden="true">$watermarkItems</div>'
      : '';
  final watermark =
      '<div class="page-watermark" aria-hidden="true">$watermarkText$watermarkLogo</div>';
  final qrSvg = showVerificationQr ? _createQrSvg(verificationUrl) : '';
  final fontFaces = [400, 500, 600, 700]
      .map((weight) {
        final font = fontDataUrls[weight] ?? '';
        return '''@font-face {
          font-family: "Cairo"; font-style: normal; font-weight: $weight;
          font-display: block; src: url("$font") format("truetype");
        }''';
      })
      .join('\n');

  return '''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8" />
<style>
$fontFaces
.telegram-export-page{position:relative;isolation:isolate;box-sizing:border-box;width:${_documentPageWidth}px;min-height:${_documentPageHeight}px;padding:${_documentMarginMm}mm;margin:0;background:#fff;color:#172033;direction:rtl;font-family:"Cairo",Tahoma,Arial,sans-serif;font-size:19px;line-height:1.85;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.telegram-export-page *{box-sizing:border-box}
.telegram-export-page .page-watermark{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.telegram-export-page .watermark-logo{position:absolute;z-index:1;top:50%;left:50%;width:93.75%;height:93.75%;transform:translate(-50%,-50%);object-fit:contain;opacity:$watermarkOpacity}
.telegram-export-page .watermark-text-pattern{position:absolute;z-index:0;inset:0;display:grid;grid-template-columns:repeat($_ministryWatermarkColumns,max-content);grid-template-rows:repeat($_ministryWatermarkRows,max-content);column-gap:$_ministryWatermarkGapCss;row-gap:$_ministryWatermarkGapCss;justify-content:space-between;align-content:space-between;align-items:center;justify-items:center;overflow:hidden;opacity:$watermarkOpacity}
.telegram-export-page .watermark-text-pattern span{color:#73777d;text-align:center;font-family:"Cairo","Noto Naskh Arabic",Tahoma,serif;font-size:8px;font-weight:400;line-height:1.2;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.telegram-export-page .official-header,.telegram-export-page .classification,.telegram-export-page .telegram-content,.telegram-export-page .document-footer{position:relative;z-index:2}
.telegram-export-page .official-header{display:grid;grid-template-columns:minmax(0,1fr) 120px minmax(0,1fr);align-items:start;gap:2px;padding:0 0 22px;border-bottom:3px solid $headerDividerColor;font-weight:700}
.telegram-export-page .header-government,.telegram-export-page .header-metadata{min-width:0}.telegram-export-page .header-government{text-align:right}.telegram-export-page .header-metadata{text-align:left}
.telegram-export-page .header-government p,.telegram-export-page .header-metadata p{margin:0;font-size:15pt;font-weight:700;line-height:1.5;white-space:nowrap;letter-spacing:-.12px;transform:scaleX(.86);transform-origin:left center}
.telegram-export-page .header-government p{transform-origin:right center}.telegram-export-page .header-date-row{transform:translateX(1ch) scaleX(.86)}
.telegram-export-page .header-date-value{display:inline-block;direction:ltr;unicode-bidi:isolate;font-size:13pt;letter-spacing:0;white-space:nowrap}
.telegram-export-page .government-name,.telegram-export-page .government-subtitle{font-size:15pt;font-weight:700;white-space:nowrap}.telegram-export-page .header-metadata{font-size:15pt;font-weight:700;line-height:1.5;white-space:nowrap}
.telegram-export-page .header-logo-cell{display:flex;align-items:center;justify-content:center;min-width:0}.telegram-export-page .official-logo{display:block;width:120px;height:120px;margin:0 auto;object-fit:contain}
.telegram-export-page .classification{display:flex;justify-content:space-between;gap:16px;margin:18px 0;padding:10px 14px;border:1px solid #d8dee8;background:#f8fafc;font-size:13px}.telegram-export-page .classification-value{font-weight:500}
.telegram-export-page .telegram-content{min-height:570px;padding:22px 24px;border:1.5px solid #253247;display:flex;flex-direction:column}
.telegram-export-page .routing{padding-bottom:14px;border-bottom:1px dotted #7b8493;line-height:2}.telegram-export-page .routing-layout{display:grid;grid-template-columns:${showVerificationQr ? 'minmax(0,1fr) 113px' : '1fr'};align-items:start;gap:16px;direction:rtl}
.telegram-export-page .routing p{margin:0}.telegram-export-page .routing-details{font-weight:500}.telegram-export-page .routing-qr{width:113px;height:113px;justify-self:start;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden}
.telegram-export-page .routing-qr svg{display:block;width:100%;height:100%;shape-rendering:crispEdges}
.telegram-export-page .body-heading{margin:20px 0 14px;text-align:center;font-size:17px;font-weight:700}.telegram-export-page .telegram-body{min-height:150px;white-space:pre-wrap;overflow-wrap:anywhere;text-align:justify;line-height:2;font-size:20px;font-weight:500}
.telegram-export-page .signature{display:flex;flex-direction:column;align-items:stretch;align-self:flex-end;width:min(48%,320px);margin-top:auto;margin-right:auto;margin-left:0;padding-top:26px;text-align:center;line-height:1.9}
.telegram-export-page .signature p{width:100%;margin:0;font-size:16px;font-weight:700;text-align:center}.telegram-export-page .signature-label{margin-top:14px!important;color:#667085;font-size:12px}
.telegram-export-page .document-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr) minmax(0, 1.35fr);
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  color: #667085;
  font-size: 11px;
  direction: rtl;
  white-space: nowrap;
}
.telegram-export-page .document-footer p {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
  margin: 0;
  white-space: nowrap;
}
.telegram-export-page .footer-icon {
  display: block;
  flex: 0 0 12px;
  width: 12px;
  height: 12px;
  fill: none;
  stroke: #667085;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.75;
}
.telegram-export-page .document-footer .footer-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.telegram-export-page .footer-creator {
  justify-content: flex-start;
  text-align: right;
}
.telegram-export-page .footer-location {
  justify-content: center;
  text-align: center;
}
.telegram-export-page .footer-date {
  justify-content: flex-end;
  text-align: left;
}
@media print{@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.telegram-export-page{width:210mm;min-height:297mm}}
</style></head><body>
<article class="telegram-export-page" dir="rtl" lang="ar">
$watermark
<header class="official-header">
<div class="header-government"><p class="government-name">الجمهورية العربية السورية</p><p class="government-subtitle">وزارة الداخلية</p>$organizationHierarchy</div>
<div class="header-logo-cell">$logo</div>
<div class="header-metadata">
<p><strong>رقم البرقية:</strong> ${_escapeHtml(displaySerial)}</p>
<p class="header-date-row"><strong>الوقت والتاريخ:</strong> <span class="header-date-value" dir="ltr">${_escapeHtml(headerCreatedAt)}</span></p>
<p><strong>درجة السرية:</strong> ${_escapeHtml(classification)}</p>
<p><strong>درجة الأسبقية:</strong> ${_escapeHtml(priority)}</p>
</div></header>
<section class="classification">
<span><strong>نوع الوثيقة:</strong> <span class="classification-value">${_escapeHtml(documentType)}</span></span>
<span><strong>التصنيف:</strong> <span class="classification-value">${_escapeHtml(category)}</span></span>
<span><strong>الحالة:</strong> <span class="classification-value">${_escapeHtml(status)}</span></span>
</section>
<main class="telegram-content">
<section class="routing"><div class="routing-layout"><div class="routing-details">
<p><strong>من:</strong> ${_escapeHtml(senderOrganizationName)}</p>
<p><strong>إلى:</strong> ${_escapeHtml(_localizeDigits(_value(telegram['recipient']), numberSystem))}</p>
<p><strong>الموضوع:</strong> ${_escapeHtml(_localizeDigits(_value(telegram['subject']), numberSystem))}</p>
</div>${showVerificationQr ? '<div class="routing-qr" role="img" aria-label="رمز QR للتحقق من أصالة البرقية">$qrSvg</div>' : ''}</div></section>
<h2 class="body-heading">نص البرقية</h2>
<div class="telegram-body">${_escapeHtml(_localizeDigits(_value(telegram['body'], fallback: 'لا يوجد نص'), numberSystem))}</div>
<section class="signature">
<p><strong>${_escapeHtml(_localizeDigits(_value(letterhead['unitChiefRank'] ?? settings['unitChiefRank'], fallback: 'رئيس الوحدة'), numberSystem))} ${_escapeHtml(_localizeDigits(_value(letterhead['unitChiefName'] ?? settings['unitChiefName'], fallback: ''), numberSystem))}</strong></p>
<p><strong>رئيس ${_escapeHtml(departmentName)}</strong></p>
</section></main>
<footer class="document-footer">
<p class="footer-creator">$_documentFooterPersonIcon<span class="footer-text">منشئ الوثيقة: ${_escapeHtml(_localizeDigits(_value(telegram['creatorName']), numberSystem))}</span></p>
<p class="footer-location">$_documentFooterLocationIcon<span class="footer-text">الموقع: ${_escapeHtml(location)}</span></p>
<p class="footer-date">$_documentFooterCalendarIcon<span class="footer-text"><span class="footer-date-label">تاريخ ووقت إخراج النسخة:</span> <span class="footer-output-time">${_escapeHtml(documentOutputAt)}</span></span></p>
</footer>
$importNotesMarkup
</article></body></html>''';
}

String _createQrSvg(String value) {
  // A fixed version leaves ample capacity for the public verification URL.
  final qrCode = QrCode(10, QrErrorCorrectLevel.L)..addData(value);
  final image = QrImage(qrCode);
  const cell = 4;
  const margin = 4;
  final modules = image.moduleCount;
  final dimension = (modules + margin * 2) * cell;
  final path = StringBuffer();
  for (var row = 0; row < modules; row++) {
    for (var column = 0; column < modules; column++) {
      if (image.isDark(row, column)) {
        final x = (column + margin) * cell;
        final y = (row + margin) * cell;
        path.write('M$x $y h$cell v$cell h-$cell z ');
      }
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="$dimension" height="$dimension" viewBox="0 0 $dimension $dimension" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#fff"/><path d="${path.toString()}" fill="#000"/></svg>';
}

String _formatConfiguredHeaderDateTime(
  Object? value,
  Map<String, dynamic> settings, {
  bool use24HourTime = false,
}) {
  final date = _configuredDate(value, settings);
  final yearMonthDay = '${date.year}/${_pad(date.month)}/${_pad(date.day)}';
  final hour12 = !use24HourTime && settings['timeFormat'] == '12';
  return _localizeDigits(
    '$yearMonthDay - ${_timeText(date, hour12)}',
    settings['numberSystem'],
  );
}

tz.TZDateTime _configuredDate(Object? value, Map<String, dynamic> settings) {
  if (!_timeZonesInitialized) {
    tzdata.initializeTimeZones();
    _timeZonesInitialized = true;
  }
  final parsed = DateTime.tryParse(_value(value));
  final utcDate = (parsed ?? DateTime.now()).toUtc();
  final timezone = _value(settings['timezone'], fallback: 'Asia/Riyadh');
  try {
    return tz.TZDateTime.from(utcDate, tz.getLocation(timezone));
  } catch (_) {
    return tz.TZDateTime.from(utcDate, tz.getLocation('Asia/Riyadh'));
  }
}

bool _timeZonesInitialized = false;

String _timeText(tz.TZDateTime date, bool hour12) {
  final hour = hour12 ? ((date.hour + 11) % 12) + 1 : date.hour;
  final period = hour12 ? _arabicDayPeriod(date.hour) : '';
  return '${_pad(hour)}:${_pad(date.minute)}:${_pad(date.second)}${period.isEmpty ? '' : ' $period'}';
}

String _arabicDayPeriod(int hour) => hour < 12 ? 'ص' : 'م';
String _pad(int value) => value.toString().padLeft(2, '0');

String _localizeDigits(String value, Object? numberSystem) {
  final useArabic = numberSystem == 'arabic';
  if (!useArabic) {
    return value.replaceAllMapped(
      RegExp(r'[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]'),
      (match) {
        final code = match.group(0)!.runes.single;
        final zero = code >= 0x6f0 && code <= 0x6f9
            ? 0x6f0
            : code >= 0x966 && code <= 0x96f
            ? 0x966
            : 0x660;
        return String.fromCharCode(0x30 + code - zero);
      },
    );
  }
  return value.replaceAllMapped(RegExp(r'[0-9\u06f0-\u06f9\u0966-\u096f]'), (
    match,
  ) {
    final code = match.group(0)!.runes.single;
    final zero = code >= 0x6f0 && code <= 0x6f9
        ? 0x6f0
        : code >= 0x966 && code <= 0x96f
        ? 0x966
        : 0x30;
    return String.fromCharCode(0x660 + code - zero);
  });
}

String _label(Map<String, String> labels, Object? key) =>
    labels[_value(key)] ?? 'غير محددة';

String _value(Object? value, {String fallback = '—'}) {
  if (value == null ||
      value.toString().trim().isEmpty ||
      value.toString() == 'null') {
    return fallback;
  }
  return value.toString().trim();
}

String _escapeHtml(String value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
