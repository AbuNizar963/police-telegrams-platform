package com.police_telegrams

import android.app.Activity
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.util.UUID

/**
 * Renders official telegram HTML with image bytes supplied out-of-band.
 *
 * The WebView has no file/content access. Only opaque telegram-resource URLs
 * registered for this conversion are served by the WebViewClient.
 */
internal class TelegramPdfResourceRenderer(
    private val activity: Activity,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(
        messenger,
        "com.police_telegrams/telegram_pdf_resources",
    )
    private val mainHandler = Handler(Looper.getMainLooper())
    private var activeWebView: WebView? = null
    private var activeContainer: FrameLayout? = null
    private var activeResult: MethodChannel.Result? = null
    private var timeoutRunnable: Runnable? = null

    init {
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != "renderHtmlToPdf") {
            result.notImplemented()
            return
        }
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post { render(call, result) }
        } else {
            render(call, result)
        }
    }

    private fun render(call: MethodCall, result: MethodChannel.Result) {
        if (activeResult != null) {
            result.error("PDF_RENDER_BUSY", "هناك عملية تجهيز وثيقة أخرى قيد التنفيذ.", null)
            return
        }
        val html = call.argument<String>("html")
        val rawResources = call.argument<List<Map<String, Any?>>>("resources")
        if (html.isNullOrBlank() || rawResources == null) {
            result.error("INVALID_PDF_REQUEST", "بيانات الوثيقة غير مكتملة.", null)
            return
        }

        if (rawResources.size > MAX_RESOURCE_COUNT) {
            result.error("INVALID_PDF_RESOURCE", "عدد موارد الصور يتجاوز الحد المسموح.", null)
            return
        }
        val resources = HashMap<String, Pair<String, ByteArray>>()
        try {
            rawResources.forEach { item ->
                val id = item["id"] as? String ?: throw IllegalArgumentException("Missing resource id")
                val mimeType = item["mimeType"] as? String ?: throw IllegalArgumentException("Missing MIME type")
                val bytes = item["bytes"] as? ByteArray ?: throw IllegalArgumentException("Missing image bytes")
                UUID.fromString(id)
                if (!mimeType.matches(Regex("^image/(png|jpeg|gif|webp)$")) ||
                    bytes.isEmpty() || bytes.size > MAX_RESOURCE_BYTES
                ) {
                    throw IllegalArgumentException("Unsupported image resource")
                }
                resources[id] = mimeType to bytes
            }
        } catch (error: Exception) {
            result.error("INVALID_PDF_RESOURCE", error.message ?: "بيانات صورة غير صالحة.", null)
            return
        }

        activeResult = result
        val container = FrameLayout(activity)
        val webView = WebView(activity)
        activeContainer = container
        activeWebView = webView
        container.alpha = 0f
        container.importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        container.addView(
            webView,
            FrameLayout.LayoutParams(
                activity.resources.displayMetrics.widthPixels,
                activity.resources.displayMetrics.heightPixels,
            ),
        )
        activity.addContentView(
            container,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: android.webkit.WebResourceRequest?,
            ): WebResourceResponse? {
                val uri = request?.url ?: return blockedResponse()
                if (uri.scheme == "telegram-resource") {
                    if (uri.host != "document" || uri.pathSegments.size != 1 ||
                        uri.query != null || uri.fragment != null
                    ) {
                        return blockedResponse()
                    }
                    val resourceId = uri.lastPathSegment ?: return blockedResponse()
                    val resource = resources[resourceId] ?: return blockedResponse()
                    return WebResourceResponse(
                        resource.first,
                        null,
                        ByteArrayInputStream(resource.second),
                    ).apply {
                        responseHeaders = mapOf(
                            "Cache-Control" to "no-store",
                            "X-Content-Type-Options" to "nosniff",
                        )
                    }
                }
                if (uri.scheme == "https" && uri.host == "telegram-document.invalid") {
                    return null
                }
                return blockedResponse()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val current = activeWebView ?: return
                val readyScript = """
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
                """.trimIndent()
                current.evaluateJavascript(readyScript) {
                    if (activeWebView === current) pollResourcesReady(current, 0)
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: android.webkit.WebResourceRequest?,
                error: android.webkit.WebResourceError?,
            ) {
                if (request?.isForMainFrame == true) {
                    finishWithError(
                        "PDF_HTML_LOAD_FAILED",
                        error?.description?.toString() ?: "تعذر تحميل قالب الوثيقة.",
                    )
                }
            }
        }

        timeoutRunnable = Runnable {
            finishWithError("PDF_RENDER_TIMEOUT", "انتهت مهلة تجهيز ملف PDF.")
        }.also { mainHandler.postDelayed(it, RENDER_TIMEOUT_MS) }

        webView.loadDataWithBaseURL(
            DOCUMENT_BASE_URL,
            html,
            "text/html",
            "UTF-8",
            null,
        )
    }

    private fun blockedResponse() = WebResourceResponse(
        "text/plain",
        "UTF-8",
        ByteArrayInputStream(ByteArray(0)),
    )

    private fun pollResourcesReady(webView: WebView, attempt: Int) {
        if (activeWebView !== webView) return
        webView.evaluateJavascript("window.__telegramPdfResourcesStatus || 'pending'") { value ->
            when (value) {
                "\"ready\"" -> printToPdf(webView)
                "\"failed\"" -> finishWithError(
                    "PDF_IMAGE_LOAD_FAILED",
                    "تعذر تحميل شعار الجهة داخل الوثيقة.",
                )
                else -> if (attempt >= RESOURCE_WAIT_ATTEMPTS) {
                    finishWithError(
                        "PDF_IMAGE_LOAD_TIMEOUT",
                        "انتهت مهلة تحميل صور الوثيقة.",
                    )
                } else {
                    mainHandler.postDelayed(
                        { pollResourcesReady(webView, attempt + 1) },
                        RESOURCE_POLL_INTERVAL_MS,
                    )
                }
            }
        }
    }

    private fun printToPdf(webView: WebView) {
        val adapter = webView.createPrintDocumentAdapter("official-telegram")
        val attributes = PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setResolution(PrintAttributes.Resolution("telegram-pdf", "PDF", 300, 300))
            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
            .build()
        adapter.onLayout(
            null,
            attributes,
            CancellationSignal(),
            object : PrintDocumentAdapter.LayoutResultCallback() {
                override fun onLayoutFinished(info: PrintDocumentInfo?, changed: Boolean) {
                    if (info == null || info.pageCount == 0) {
                        finishWithError("PDF_LAYOUT_EMPTY", "لم ينتج محرك الطباعة صفحات للوثيقة.")
                        return
                    }
                    writePdf(adapter)
                }

                override fun onLayoutFailed(error: CharSequence?) {
                    finishWithError("PDF_LAYOUT_FAILED", error?.toString() ?: "تعذر تخطيط صفحات الوثيقة.")
                }

                override fun onLayoutCancelled() {
                    finishWithError("PDF_LAYOUT_CANCELLED", "أُلغيت عملية تخطيط الوثيقة.")
                }
            },
            null,
        )
    }

    private fun writePdf(adapter: PrintDocumentAdapter) {
        val output = try {
            File.createTempFile("official-telegram-", ".pdf", activity.cacheDir)
        } catch (error: IOException) {
            finishWithError("PDF_FILE_CREATE_FAILED", error.message ?: "تعذر إنشاء ملف PDF المؤقت.")
            return
        }
        val descriptor = try {
            android.os.ParcelFileDescriptor.open(
                output,
                android.os.ParcelFileDescriptor.MODE_READ_WRITE or
                    android.os.ParcelFileDescriptor.MODE_CREATE or
                    android.os.ParcelFileDescriptor.MODE_TRUNCATE,
            )
        } catch (error: IOException) {
            output.delete()
            finishWithError("PDF_FILE_OPEN_FAILED", error.message ?: "تعذر تجهيز ملف PDF المؤقت.")
            return
        }

        adapter.onWrite(
            arrayOf(PageRange.ALL_PAGES),
            descriptor,
            CancellationSignal(),
            object : PrintDocumentAdapter.WriteResultCallback() {
                override fun onWriteFinished(pages: Array<PageRange>) {
                    try {
                        descriptor.close()
                        val bytes = output.readBytes()
                        if (bytes.isEmpty()) {
                            finishWithError("PDF_OUTPUT_EMPTY", "ملف PDF الناتج فارغ.")
                        } else {
                            finishWithBytes(bytes)
                        }
                    } catch (error: Exception) {
                        finishWithError("PDF_READ_FAILED", error.message ?: "تعذرت قراءة ملف PDF.")
                    } finally {
                        output.delete()
                    }
                }

                override fun onWriteFailed(error: CharSequence?) {
                    try { descriptor.close() } catch (_: Exception) {}
                    output.delete()
                    finishWithError("PDF_WRITE_FAILED", error?.toString() ?: "تعذرت كتابة صفحات PDF.")
                }

                override fun onWriteCancelled() {
                    try { descriptor.close() } catch (_: Exception) {}
                    output.delete()
                    finishWithError("PDF_WRITE_CANCELLED", "أُلغيت كتابة ملف PDF.")
                }
            },
        )
    }

    private fun finishWithBytes(bytes: ByteArray) {
        val result = activeResult ?: return
        cleanup()
        result.success(bytes)
    }

    private fun finishWithError(code: String, message: String) {
        val result = activeResult ?: return
        cleanup()
        result.error(code, message, null)
    }

    private fun cleanup() {
        timeoutRunnable?.let(mainHandler::removeCallbacks)
        timeoutRunnable = null
        activeWebView?.apply {
            stopLoading()
            webViewClient = WebViewClient()
            destroy()
        }
        activeContainer?.let { container ->
            (container.parent as? android.view.ViewGroup)?.removeView(container)
        }
        activeWebView = null
        activeContainer = null
        activeResult = null
    }

    companion object {
        private const val DOCUMENT_BASE_URL = "https://telegram-document.invalid/"
        private const val RENDER_TIMEOUT_MS = 25_000L
        private const val RESOURCE_POLL_INTERVAL_MS = 100L
        private const val RESOURCE_WAIT_ATTEMPTS = 150
        private const val MAX_RESOURCE_COUNT = 8
        private const val MAX_RESOURCE_BYTES = 10 * 1024 * 1024
    }
}
