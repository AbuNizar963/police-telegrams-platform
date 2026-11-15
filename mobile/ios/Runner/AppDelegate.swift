import Flutter
import UIKit
import WebKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    guard let registrar = engineBridge.pluginRegistry.registrar(
      forPlugin: "TelegramPdfResourceRendererPlugin"
    ) else {
      return
    }
    TelegramPdfResourceRendererPlugin.register(with: registrar)
  }
}


private struct TelegramPdfImageResource {
  let data: Data
  let mimeType: String
}

private final class TelegramPdfResourceSchemeHandler: NSObject, WKURLSchemeHandler {
  private let resources: [String: TelegramPdfImageResource]

  init(resources: [String: TelegramPdfImageResource]) {
    self.resources = resources
    super.init()
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard
      let url = urlSchemeTask.request.url,
      url.host == "document",
      url.pathComponents.count == 2,
      url.query == nil,
      url.fragment == nil,
      let resource = resources[url.lastPathComponent]
    else {
      urlSchemeTask.didFailWithError(
        NSError(
          domain: "TelegramPdfResource",
          code: 404,
          userInfo: [NSLocalizedDescriptionKey: "Document image resource not found."]
        )
      )
      return
    }

    let response = URLResponse(
      url: url,
      mimeType: resource.mimeType,
      expectedContentLength: resource.data.count,
      textEncodingName: nil
    )
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(resource.data)
    urlSchemeTask.didFinish()
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

private final class TelegramA4PrintPageRenderer: UIPrintPageRenderer {
  private let a4 = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)

  override var paperRect: CGRect { a4 }
  override var printableRect: CGRect { a4 }
}

/// Native WebKit renderer for official telegram HTML and isolated image bytes.
private final class TelegramPdfResourceRendererPlugin: NSObject, FlutterPlugin, WKNavigationDelegate {
  private static let channelName = "com.police_telegrams/telegram_pdf_resources"
  private static let baseURL = URL(string: "https://telegram-document.invalid/")!
  private static let timeout: TimeInterval = 25

  private var webView: WKWebView?
  private var schemeHandler: TelegramPdfResourceSchemeHandler?
  private var pendingResult: FlutterResult?
  private var timeoutWorkItem: DispatchWorkItem?

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: channelName,
      binaryMessenger: registrar.messenger()
    )
    let instance = TelegramPdfResourceRendererPlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "renderHtmlToPdf" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard pendingResult == nil else {
      result(
        FlutterError(
          code: "PDF_RENDER_BUSY",
          message: "هناك عملية تجهيز وثيقة أخرى قيد التنفيذ.",
          details: nil
        )
      )
      return
    }
    guard
      let arguments = call.arguments as? [String: Any],
      let html = arguments["html"] as? String,
      !html.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      let rawResources = arguments["resources"] as? [[String: Any]]
    else {
      result(
        FlutterError(
          code: "INVALID_PDF_REQUEST",
          message: "بيانات الوثيقة غير مكتملة.",
          details: nil
        )
      )
      return
    }

    guard rawResources.count <= 8 else {
      result(
        FlutterError(
          code: "INVALID_PDF_RESOURCE",
          message: "عدد موارد الصور يتجاوز الحد المسموح.",
          details: nil
        )
      )
      return
    }

    var resources: [String: TelegramPdfImageResource] = [:]
    var totalResourceBytes = 0
    for item in rawResources {
      guard
        let id = item["id"] as? String,
        UUID(uuidString: id) != nil,
        let mimeType = item["mimeType"] as? String,
        ["image/png", "image/jpeg", "image/gif", "image/webp"].contains(mimeType),
        let typedData = item["bytes"] as? FlutterStandardTypedData,
        !typedData.data.isEmpty,
        typedData.data.count <= 10 * 1024 * 1024
      else {
        result(
          FlutterError(
            code: "INVALID_PDF_RESOURCE",
            message: "بيانات صورة الوثيقة غير صالحة.",
            details: nil
          )
        )
        return
      }
      totalResourceBytes += typedData.data.count
      guard totalResourceBytes <= 20 * 1024 * 1024 else {
        result(
          FlutterError(
            code: "INVALID_PDF_RESOURCE",
            message: "حجم صور الوثيقة الإجمالي يتجاوز الحد المسموح.",
            details: nil
          )
        )
        return
      }
      guard resources[id] == nil else {
        result(
          FlutterError(
            code: "INVALID_PDF_RESOURCE",
            message: "تكرار معرّف مورد صورة الوثيقة.",
            details: nil
          )
        )
        return
      }
      resources[id] = TelegramPdfImageResource(
        data: typedData.data,
        mimeType: mimeType
      )
    }

    pendingResult = result
    let handler = TelegramPdfResourceSchemeHandler(resources: resources)
    schemeHandler = handler

    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(handler, forURLScheme: "telegram-resource")
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

    let webView = WKWebView(
      frame: CGRect(x: 0, y: 0, width: 595.28, height: 841.89),
      configuration: configuration
    )
    webView.navigationDelegate = self
    webView.isOpaque = false
    webView.backgroundColor = .white
    webView.scrollView.backgroundColor = .white
    self.webView = webView

    let timeoutItem = DispatchWorkItem { [weak self] in
      self?.finish(
        error: FlutterError(
          code: "PDF_RENDER_TIMEOUT",
          message: "انتهت مهلة تجهيز ملف PDF.",
          details: nil
        )
      )
    }
    timeoutWorkItem = timeoutItem
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.timeout, execute: timeoutItem)

    webView.loadHTMLString(html, baseURL: Self.baseURL)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    let readyScript = """
      (function() {
        window.__telegramPdfResourcesStatus = 'pending';
        const images = Array.from(document.images);
        Promise.all(images.map((image) =>
          image.decode().then(() => true).catch(() => false)
        )).then((results) => document.fonts.ready.then(() => {
          window.__telegramPdfResourcesStatus =
            results.every(Boolean) ? 'ready' : 'failed';
        })).catch(() => {
          window.__telegramPdfResourcesStatus = 'failed';
        });
      })();
    """
    webView.evaluateJavaScript(readyScript) { [weak self] _, error in
      guard let self, self.webView === webView else { return }
      if let error {
        self.finish(
          error: FlutterError(
            code: "PDF_IMAGE_LOAD_FAILED",
            message: "تعذر تحميل صور الوثيقة.",
            details: error.localizedDescription
          )
        )
        return
      }
      self.pollResourcesReady(webView, attempt: 0)
    }
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    finish(
      error: FlutterError(
        code: "PDF_HTML_LOAD_FAILED",
        message: "تعذر تحميل قالب الوثيقة.",
        details: error.localizedDescription
      )
    )
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    finish(
      error: FlutterError(
        code: "PDF_HTML_LOAD_FAILED",
        message: "تعذر فتح قالب الوثيقة.",
        details: error.localizedDescription
      )
    )
  }

  private func pollResourcesReady(_ webView: WKWebView, attempt: Int) {
    guard self.webView === webView else { return }
    webView.evaluateJavaScript("window.__telegramPdfResourcesStatus || 'pending'") {
      [weak self] value, error in
      guard let self, self.webView === webView else { return }
      if error != nil || (value as? String) == "failed" {
        self.finish(
          error: FlutterError(
            code: "PDF_IMAGE_LOAD_FAILED",
            message: "تعذر تحميل شعار الجهة داخل الوثيقة.",
            details: error?.localizedDescription
          )
        )
      } else if (value as? String) == "ready" {
        self.createPdf(from: webView)
      } else if attempt >= 150 {
        self.finish(
          error: FlutterError(
            code: "PDF_IMAGE_LOAD_TIMEOUT",
            message: "انتهت مهلة تحميل صور الوثيقة.",
            details: nil
          )
        )
      } else {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
          self.pollResourcesReady(webView, attempt: attempt + 1)
        }
      }
    }
  }

  private func createPdf(from webView: WKWebView) {
    let pageRenderer = TelegramA4PrintPageRenderer()
    pageRenderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
    pageRenderer.prepare(
      forDrawingPages: NSRange(location: 0, length: pageRenderer.numberOfPages)
    )
    guard pageRenderer.numberOfPages > 0 else {
      finish(
        error: FlutterError(
          code: "PDF_LAYOUT_EMPTY",
          message: "لم ينتج محرك الطباعة صفحات للوثيقة.",
          details: nil
        )
      )
      return
    }

    let pageRect = pageRenderer.paperRect
    let pdfData = UIGraphicsPDFRenderer(bounds: pageRect).pdfData { context in
      for page in 0..<pageRenderer.numberOfPages {
        context.beginPage()
        pageRenderer.drawPage(at: page, in: pageRect)
      }
    }
    guard !pdfData.isEmpty else {
      finish(
        error: FlutterError(
          code: "PDF_OUTPUT_EMPTY",
          message: "ملف PDF الناتج فارغ.",
          details: nil
        )
      )
      return
    }
    finish(data: pdfData)
  }

  private func finish(data: Data) {
    guard let result = pendingResult else { return }
    cleanup()
    result(FlutterStandardTypedData(bytes: data))
  }

  private func finish(error: FlutterError) {
    guard let result = pendingResult else { return }
    cleanup()
    result(error)
  }

  private func cleanup() {
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    webView?.stopLoading()
    webView?.navigationDelegate = nil
    webView = nil
    schemeHandler = nil
    pendingResult = nil
  }
}
