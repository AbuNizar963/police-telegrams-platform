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
import 'telegram_display.dart';

const _documentPageWidth = 794;
const _documentPageHeight = 1123;
const _documentMarginMm = 12.7;
const _documentPreviewDpi = 150.0;
const _documentImageExportDpi = 300.0;

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

class OfficialTelegramDocumentPage extends StatefulWidget {
  const OfficialTelegramDocumentPage({
    super.key,
    required this.api,
    required this.telegramId,
    this.onEdit,
    this.onDelete,
    this.onSubmitForReview,
  });

  final PoliceApi api;
  final int telegramId;
  final Future<void> Function()? onEdit;
  final Future<void> Function()? onDelete;
  final Future<void> Function()? onSubmitForReview;

  @override
  State<OfficialTelegramDocumentPage> createState() =>
      _OfficialTelegramDocumentPageState();
}

class _OfficialTelegramDocumentPageState
    extends State<OfficialTelegramDocumentPage> {
  bool loading = true;
  bool busy = false;
  String? error;
  Uint8List? preview;
  Uint8List? highResolutionImage;
  Map<String, dynamic>? telegram;
  Map<String, dynamic>? settings;
  String? documentHtml;
  Uint8List? cachedPdf;
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

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
        preview = null;
        highResolutionImage = null;
        cachedPdf = null;
      });
    }
    try {
      final results = await Future.wait<dynamic>([
        widget.api.call('telegrams.get', input: {'id': widget.telegramId}),
        widget.api.call('settings.get'),
        widget.api.call('organizations.routingDirectory'),
      ]);
      final telegramData = Map<String, dynamic>.from(results[0] as Map);
      final settingsData = results[1] is Map
          ? Map<String, dynamic>.from(results[1] as Map)
          : <String, dynamic>{};
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
        _loadLogoDataUrl(settingsData['logoUrl']),
      ]);
      final fontDataUrls = resources[0] as Map<int, String>;
      final logoDataUrl = resources[1] as String?;
      final token = _value(telegramData['verificationToken']);
      final verificationUrl = Uri.parse(widget.api.baseUrl)
          .resolve('/verify/${Uri.encodeComponent(token)}')
          .toString();
      final html = buildOfficialTelegramHtml(
        telegram: telegramData,
        settings: settingsData,
        routingDirectory: routingDirectory,
        verificationUrl: verificationUrl,
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
        documentHtml = html;
        cachedPdf = pdfBytes;
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

  Future<String?> _loadLogoDataUrl(Object? source) async {
    final url = _value(source, fallback: '');
    if (url.isEmpty) return null;
    try {
      final bytes = await widget.api.fetchImageAsset(url);
      if (bytes == null || bytes.isEmpty) return null;
      final normalized = await normalizeOfficialDocumentLogo(bytes);
      return 'data:image/png;base64,${base64Encode(normalized)}';
    } catch (_) {
      // Use the same vector seal as the web template if an optional logo fails.
      return null;
    }
  }

  Future<Uint8List> _getPdfBytes() async {
    final cached = cachedPdf;
    if (cached != null) return cached;
    final html = documentHtml;
    if (html == null) throw Exception('تعذر تجهيز قالب الوثيقة.');
    // Fallback for callers that reach PDF export before initial rendering
    // has populated the cache. Conversion stays entirely on the device.
    final bytes = await _renderer.renderPdf(html);
    if (bytes.isEmpty) {
      throw Exception('تعذر إنشاء ملف الوثيقة على الجهاز.');
    }
    if (mounted) setState(() => cachedPdf = bytes);
    return bytes;
  }

  Future<Uint8List> _getHighResolutionImage() async {
    final cached = highResolutionImage;
    if (cached != null) return cached;
    final image = await _renderer.renderHighResolutionImage(
      await _getPdfBytes(),
    );
    if (image.isEmpty) {
      throw Exception('تعذر تجهيز صورة الوثيقة بدقة الطباعة.');
    }
    if (mounted) setState(() => highResolutionImage = image);
    return image;
  }

  String get _fileBaseName {
    final serial = _displaySerial == '—' ? 'telegram' : _displaySerial;
    final safe = serial.replaceAll(RegExp(r'[\\/:*?"<>|\u0000-\u001f]'), '-');
    return 'telegram-$safe';
  }

  String get _displaySerial => localizeTelegramDigits(
    getTelegramDisplayNumber(getTelegramSerialCode(telegram ?? const {})),
    settings?['numberSystem'],
  );

  Future<void> _perform(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (exception) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(exception.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _printPdf() => _perform(() async {
    final bytes = await _getPdfBytes();
    await Printing.layoutPdf(
      name: '$_fileBaseName.pdf',
      onLayout: (_) async => bytes,
    );
  });

  Future<void> _savePdf() => _perform(() async {
    final bytes = await _getPdfBytes();
    final path = await FilePicker.saveFile(
      dialogTitle: 'حفظ الوثيقة الرسمية',
      fileName: '$_fileBaseName.pdf',
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      bytes: bytes,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(path == null ? 'تم إلغاء حفظ الملف.' : 'تم حفظ الوثيقة.'),
      ),
    );
  });

  Future<void> _sharePdf() => _perform(() async {
    final bytes = await _getPdfBytes();
    await Printing.sharePdf(bytes: bytes, filename: '$_fileBaseName.pdf');
  });

  Future<void> _shareImage() => _perform(() async {
    final bytes = await _getHighResolutionImage();
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
    final bytes = await _getHighResolutionImage();
    final path = await FilePicker.saveFile(
      dialogTitle: 'حفظ صورة الوثيقة الرسمية',
      fileName: '$_fileBaseName.png',
      type: FileType.custom,
      allowedExtensions: const ['png'],
      bytes: bytes,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(path == null ? 'تم إلغاء حفظ الصورة.' : 'تم حفظ الصورة.'),
      ),
    );
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('تم إرفاق الملف بالبرقية.')));
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
                            label: 'صورة عالية الدقة',
                            icon: Icons.image_outlined,
                            onPressed: busy ? null : () => _saveImage(),
                          ),
                          _documentAction(
                            label: 'PDF مطابق للطباعة',
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
  required List<Map<String, dynamic>> routingDirectory,
  required String verificationUrl,
  required Map<int, String> fontDataUrls,
  String? logoDataUrl,
}) {
  final numberSystem = settings['numberSystem'];
  final departmentName = _localizeDigits(
    _value(settings['departmentName'], fallback: 'قسم العمليات'),
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
  final hierarchyNames = <String>[];
  var hierarchyId = _value(
    telegram['currentOrganizationId'] ?? telegram['organizationId'],
    fallback: '',
  );
  final visited = <String>{};
  while (hierarchyId.isNotEmpty && visited.add(hierarchyId)) {
    final organization = hierarchyById[hierarchyId];
    if (organization == null) break;
    hierarchyNames.insert(0, _value(organization['name']));
    hierarchyId = _value(organization['parentOrganizationId'], fallback: '');
  }
  final hierarchyCandidates = hierarchyNames.isNotEmpty
      ? [...hierarchyNames]
      : [
          _value(settings['unitName'], fallback: 'قيادة الأمن الداخلي'),
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

  final createdAt = _formatConfiguredDate(telegram['createdAt'], settings);
  final headerCreatedAt = _formatConfiguredHeaderDateTime(
    telegram['createdAt'],
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
  final displaySerial = localizeTelegramDigits(
    getTelegramDisplayNumber(getTelegramSerialCode(telegram)),
    numberSystem,
  );
  final outgoing =
      _value(telegram['organizationId'], fallback: '') ==
      _value(telegram['currentOrganizationId'], fallback: '');
  final documentType = outgoing ? 'برقية صادرة' : 'برقية واردة';
  final classification = _label({
    'secret': 'سري',
    'normal': 'عادي',
  }, telegram['classification']);
  final priority = _label({
    'slow': 'بطيء',
    'normal': 'عادي',
    'urgent': 'عاجل',
  }, telegram['priority']);
  final category = _label({
    'criminal': 'جنائي',
    'administrative': 'إداري',
    'traffic': 'مروري',
    'security': 'أمني',
    'tactical': 'عملياتي',
    'intelligence': 'استخباراتي',
    'emergency': 'طوارئ',
    'public_order': 'حفظ النظام',
    'personnel': 'شؤون الأفراد',
    'logistics': 'إمداد ودعم',
    'training': 'تدريب وتأهيل',
    'community': 'مجتمعي وشكاوى',
    'other': 'أخرى',
  }, telegram['category']);
  final status = _label({
    'draft': 'مسودة',
    'submitted': 'مرسلة للمراجعة',
    'in_review': 'قيد المراجعة',
    'approved': 'معتمدة',
    'returned': 'معادة للتصحيح',
    'rejected': 'مرفوضة',
    'forwarded': 'محالة',
    'pending': 'قيد الانتظار',
    'in_progress': 'قيد الإجراء',
    'resolved': 'منجزة',
    'completed': 'مكتملة',
    'archived': 'مؤرشفة',
  }, telegram['status']);
  final logo = logoDataUrl == null
      ? '<div class="official-seal" aria-label="الشعار الرسمي"><span>★</span><strong>وزارة<br />الداخلية</strong></div>'
      : '<img class="official-logo" src="${_escapeHtml(logoDataUrl)}" alt="الشعار الرسمي" />';
  final watermark = logoDataUrl == null
      ? '<div class="watermark-seal" aria-hidden="true"><span>★</span><strong>وزارة<br />الداخلية</strong></div>'
      : '<img class="watermark-logo" src="${_escapeHtml(logoDataUrl)}" alt="" aria-hidden="true" />';
  final qrSvg = _createQrSvg(verificationUrl);
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
.telegram-export-page .page-watermark{position:absolute;top:50%;left:50%;z-index:0;width:560px;height:560px;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;opacity:.16;pointer-events:none}
.telegram-export-page .watermark-logo{display:block;width:100%;height:100%;object-fit:contain}
.telegram-export-page .watermark-seal{width:100%;height:100%;border:7px solid #9a813c;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9a813c;text-align:center;line-height:1.25}
.telegram-export-page .watermark-seal span{font-size:68px}.telegram-export-page .watermark-seal strong{font-size:28px}
.telegram-export-page .official-header,.telegram-export-page .classification,.telegram-export-page .telegram-content,.telegram-export-page .document-footer{position:relative;z-index:1}
.telegram-export-page .official-header{display:grid;grid-template-columns:minmax(0,1fr) 120px minmax(0,1fr);align-items:start;gap:2px;padding:0 0 22px;border-bottom:3px solid #b49a55;font-weight:700}
.telegram-export-page .header-government,.telegram-export-page .header-metadata{min-width:0}.telegram-export-page .header-government{text-align:right}.telegram-export-page .header-metadata{text-align:left}
.telegram-export-page .header-government p,.telegram-export-page .header-metadata p{margin:0;font-size:15pt;font-weight:700;line-height:1.25;white-space:nowrap;letter-spacing:-.12px;transform:scaleX(.86);transform-origin:left center}
.telegram-export-page .header-government p{transform-origin:right center}.telegram-export-page .header-date-row{transform:translateX(1ch) scaleX(.86)}
.telegram-export-page .header-date-value{display:inline-block;direction:ltr;unicode-bidi:isolate;font-size:13pt;letter-spacing:0;white-space:nowrap}
.telegram-export-page .government-name,.telegram-export-page .government-subtitle{font-size:15pt;font-weight:700;white-space:nowrap}.telegram-export-page .header-metadata{font-size:15pt;font-weight:700;line-height:1.25;white-space:nowrap}
.telegram-export-page .header-logo-cell{display:flex;align-items:center;justify-content:center;min-width:0}.telegram-export-page .official-logo{display:block;width:120px;height:120px;margin:0 auto;object-fit:contain}
.telegram-export-page .official-seal{width:110px;height:110px;margin:0 auto;border:2px solid #b49a55;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9a813c;text-align:center;line-height:1.2}
.telegram-export-page .official-seal span{font-size:20px}.telegram-export-page .official-seal strong{font-size:11px}
.telegram-export-page .classification{display:flex;justify-content:space-between;gap:16px;margin:18px 0;padding:10px 14px;border:1px solid #d8dee8;background:#f8fafc;font-size:13px}.telegram-export-page .classification-value{font-weight:500}
.telegram-export-page .telegram-content{min-height:570px;padding:22px 24px;border:1.5px solid #253247;display:flex;flex-direction:column}
.telegram-export-page .routing{padding-bottom:14px;border-bottom:1px dotted #7b8493;line-height:2}.telegram-export-page .routing-layout{display:grid;grid-template-columns:minmax(0,1fr) 113px;align-items:start;gap:16px;direction:rtl}
.telegram-export-page .routing p{margin:0}.telegram-export-page .routing-details{font-weight:500}.telegram-export-page .routing-qr{width:113px;height:113px;justify-self:start;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden}
.telegram-export-page .routing-qr svg{display:block;width:100%;height:100%;shape-rendering:crispEdges}
.telegram-export-page .body-heading{margin:20px 0 14px;text-align:center;font-size:17px;font-weight:700}.telegram-export-page .telegram-body{min-height:150px;white-space:pre-wrap;overflow-wrap:anywhere;text-align:justify;line-height:2;font-size:20px;font-weight:500}
.telegram-export-page .signature{display:flex;flex-direction:column;align-items:stretch;align-self:flex-end;width:min(48%,320px);margin-top:auto;margin-right:auto;margin-left:0;padding-top:26px;text-align:center;line-height:1.9}
.telegram-export-page .signature p{width:100%;margin:0;font-size:16px;font-weight:700;text-align:center}.telegram-export-page .signature-label{margin-top:14px!important;color:#667085;font-size:12px}
.telegram-export-page .document-footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);align-items:start;gap:12px;margin-top:16px;color:#667085;font-size:11px;direction:rtl}
.telegram-export-page .document-footer p{margin:0}.telegram-export-page .footer-creator{text-align:right}.telegram-export-page .footer-location{text-align:center}.telegram-export-page .footer-date{text-align:left}
@media print{@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.telegram-export-page{width:210mm;min-height:297mm}}
</style></head><body>
<article class="telegram-export-page" dir="rtl" lang="ar">
<div class="page-watermark" aria-hidden="true">$watermark</div>
<header class="official-header">
<div class="header-government"><p class="government-name">الجمهورية العربية السورية</p><p class="government-subtitle">وزارة الداخلية</p>$organizationHierarchy</div>
<div class="header-logo-cell">$logo</div>
<div class="header-metadata">
<p><strong>رقم البرقية:</strong> ${_escapeHtml(displaySerial)}</p>
<p class="header-date-row"><strong>الوقت والتاريخ:</strong> <span class="header-date-value" dir="ltr">${_escapeHtml(headerCreatedAt)}</span></p>
<p><strong>درجة السرية:</strong> ${_escapeHtml(classification)}</p>
<p><strong>درجة الأولوية:</strong> ${_escapeHtml(priority)}</p>
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
</div><div class="routing-qr" role="img" aria-label="رمز QR للتحقق من أصالة البرقية">$qrSvg</div></div></section>
<h2 class="body-heading">نص البرقية</h2>
<div class="telegram-body">${_escapeHtml(_localizeDigits(_value(telegram['body'], fallback: 'لا يوجد نص'), numberSystem))}</div>
<section class="signature">
<p><strong>${_escapeHtml(_localizeDigits(_value(settings['unitChiefRank'], fallback: 'رئيس الوحدة'), numberSystem))} ${_escapeHtml(_localizeDigits(_value(settings['unitChiefName'], fallback: ''), numberSystem))}</strong></p>
<p><strong>رئيس ${_escapeHtml(departmentName)}</strong></p>
</section></main>
<footer class="document-footer">
<p class="footer-creator">تم إنشاء هذه الوثيقة بواسطة: ${_escapeHtml(_localizeDigits(_value(telegram['creatorName']), numberSystem))}</p>
<p class="footer-location">الموقع: ${_escapeHtml(location)}</p>
<p class="footer-date">تاريخ إنشاء البرقية: ${_escapeHtml(createdAt)}</p>
</footer>
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

String _formatConfiguredDate(Object? value, Map<String, dynamic> settings) {
  final date = _configuredDate(value, settings);
  final hour12 = settings['timeFormat'] == '12';
  final time = _timeText(date, hour12);
  final format = _value(
    settings['dateFormat'],
    fallback: 'yyyy/MM/dd HH:mm:ss',
  );
  if (format == 'dd MMM yyyy HH:mm') {
    const months = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    final period = hour12 ? _arabicDayPeriod(date.hour) : '';
    final shortTime =
        '${_pad(hour12 ? ((date.hour + 11) % 12) + 1 : date.hour)}:${_pad(date.minute)}${period.isEmpty ? '' : ' $period'}';
    return _localizeDigits(
      '${date.day} ${months[date.month - 1]} ${date.year} $shortTime',
      settings['numberSystem'],
    );
  }
  final datePart = format == 'yyyy-MM-dd HH:mm:ss'
      ? '${date.year}-${_pad(date.month)}-${_pad(date.day)}'
      : format == 'yyyy/MM/dd HH:mm:ss'
      ? '${date.year}/${_pad(date.month)}/${_pad(date.day)}'
      : '${_pad(date.day)}/${_pad(date.month)}/${date.year}';
  return _localizeDigits('$datePart $time', settings['numberSystem']);
}

String _formatConfiguredHeaderDateTime(
  Object? value,
  Map<String, dynamic> settings,
) {
  final date = _configuredDate(value, settings);
  final yearMonthDay = '${date.year}/${date.month}/${date.day}';
  return _localizeDigits(
    '$yearMonthDay - ${_timeText(date, settings['timeFormat'] == '12')}',
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
