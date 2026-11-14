package com.police_telegrams

import android.app.PendingIntent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import io.flutter.plugin.common.EventChannel
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Downloads and validates an official APK in the app cache, then hands it to
 * Android's PackageInstaller. Android remains responsible for user confirmation.
 */
class UpdateInstaller(private val context: Context) {
    companion object {
        const val INSTALL_PERMISSION_REQUIRED = "INSTALL_PERMISSION_REQUIRED"
        private const val INSTALL_REQUEST_CODE = 7412
        private const val UPDATE_DIRECTORY = "updates"
        private const val NOTIFICATION_CHANNEL_ID = "app_update_progress"
        private const val NOTIFICATION_ID = 4107
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var eventSink: EventChannel.EventSink? = null

    fun setEventSink(sink: EventChannel.EventSink?) {
        eventSink = sink
    }

    private fun emit(event: Map<String, Any?>) {
        val sink = eventSink ?: return
        mainHandler.post { runCatching { sink.success(event) } }
    }

    private fun emitError(error: Throwable) {
        val sink = eventSink ?: return
        mainHandler.post {
            sink.error("UPDATE_DOWNLOAD_FAILED", error.message ?: "تعذر تنزيل التحديث.", null)
        }
    }

    fun startDownload(
        downloadUrl: String,
        expectedSize: Long,
        expectedSha256: String,
        expectedVersionName: String,
        expectedVersionCode: Long
    ) {
        require(isTrustedReleaseUrl(downloadUrl)) { "رابط ملف التحديث غير موثوق." }
        require(expectedSize > 0L) { "حجم ملف التحديث غير صالح." }
        require(expectedSha256.matches(Regex("^[a-fA-F0-9]{64}$"))) {
            "بصمة ملف التحديث غير صالحة."
        }
        require(expectedVersionName.matches(Regex("^\\d+\\.\\d+\\.\\d+$"))) {
            "رقم إصدار التحديث غير صالح."
        }
        require(expectedVersionCode > 0L) { "رقم بناء التحديث غير صالح." }

        val installedCode = currentVersionCode()
        require(expectedVersionCode > installedCode) {
            "الإصدار المنشور ليس أحدث من الإصدار المثبت."
        }

        showNotification("جارٍ تنزيل تحديث برقيات الشرطة", "يبدأ تنزيل ملف التحديث...", 0, true)
        Thread({
            val directory = File(context.cacheDir, UPDATE_DIRECTORY)
            val apk = File(directory, "police-telegrams-update-$expectedVersionCode.apk")
            try {
                if (!directory.exists() && !directory.mkdirs()) {
                    error("تعذر تجهيز مساحة تنزيل التحديث.")
                }
                apk.delete()
                download(downloadUrl, apk, expectedSize)
                validateApk(
                    apk,
                    expectedSize,
                    expectedSha256,
                    expectedVersionName,
                    expectedVersionCode
                )
                showNotification("اكتمل تنزيل التحديث", "تم تنزيل الملف والتحقق من سلامته. افتح التطبيق لمتابعة التثبيت.", 100, false, completed = true)
                emit(
                    mapOf(
                        "status" to "completed",
                        "path" to apk.absolutePath,
                        "downloadedBytes" to apk.length(),
                        "totalBytes" to expectedSize,
                        "percent" to 100
                    )
                )
            } catch (failure: Throwable) {
                apk.delete()
                showNotification("تعذر تنزيل التحديث", failure.message ?: "فشل تنزيل التحديث. افتح التطبيق وحاول مجددًا.", 0, false, failed = true)
                emitError(failure)
            }
        }, "police-telegrams-updater").apply { isDaemon = true }.start()
    }

    private fun showNotification(
        title: String,
        message: String,
        progress: Int,
        ongoing: Boolean,
        completed: Boolean = false,
        failed: Boolean = false
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) == null
        ) {
            manager.createNotificationChannel(
                NotificationChannel(NOTIFICATION_CHANNEL_ID, "تحديث التطبيق", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "تقدم تنزيل تحديثات تطبيق برقيات الشرطة"
                    setShowBadge(false)
                }
            )
        }
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(context, NOTIFICATION_ID, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val builder = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(ongoing)
            .setAutoCancel(false)
            .setProgress(100, progress.coerceIn(0, 100), false)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        if (contentIntent != null) builder.setContentIntent(contentIntent)
        if (completed || failed) {
            builder.setOngoing(false).setAutoCancel(true).setProgress(0, 0, false)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
        }
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
        } catch (_: SecurityException) {
            // Notification permission may be revoked while the transfer is running.
        }
    }

    private fun formatBytes(bytes: Long): String {
        val megabytes = bytes / (1024.0 * 1024.0)
        return String.format(java.util.Locale.ROOT, "%.1f MB", megabytes)
    }

    private fun isTrustedReleaseUrl(value: String): Boolean {
        val uri = Uri.parse(value)
        return uri.scheme == "https" &&
            uri.host == "github.com" &&
            uri.path.orEmpty().contains("/releases/download/")
    }

    private fun download(url: String, destination: File, expectedSize: Long) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 120_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "Police-Telegrams-Android-Updater")
            setRequestProperty("Cache-Control", "no-cache")
        }
        try {
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                error("فشل تنزيل ملف التحديث (HTTP $responseCode).")
            }
            val contentLength = connection.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
            if (contentLength > 0L && contentLength != expectedSize) {
                error("حجم ملف التحديث المعلن لا يطابق بيانات الإصدار.")
            }

            val startedAt = System.currentTimeMillis()
            var downloaded = 0L
            var lastEmission = 0L
            connection.inputStream.use { input ->
                destination.outputStream().buffered().use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        downloaded += count
                        if (downloaded > expectedSize) {
                            error("تجاوز ملف التحديث الحجم المتوقع؛ أُوقف التنزيل.")
                        }
                        val now = System.currentTimeMillis()
                        if (now - lastEmission >= 250L) {
                            val percent = ((downloaded * 100L) / expectedSize)
                                .coerceIn(0L, 99L).toInt()
                            val elapsedSeconds = ((now - startedAt) / 1000L).coerceAtLeast(1L)
                            val bytesPerSecond = downloaded / elapsedSeconds
                            val remaining = (expectedSize - downloaded).coerceAtLeast(0L)
                            showNotification("جارٍ تنزيل تحديث برقيات الشرطة", "اكتمل $percent% • ${formatBytes(downloaded)} من ${formatBytes(expectedSize)}", percent, true)
                            emit(
                                mapOf(
                                    "status" to "downloading",
                                    "downloadedBytes" to downloaded,
                                    "totalBytes" to expectedSize,
                                    "percent" to percent,
                                    "etaSeconds" to if (bytesPerSecond > 0L) remaining / bytesPerSecond else null
                                )
                            )
                            lastEmission = now
                        }
                    }
                    output.flush()
                }
            }
            if (downloaded != expectedSize || !destination.isFile) {
                error("لم يكتمل تنزيل ملف التحديث بالحجم الصحيح.")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun validateApk(
        apk: File,
        expectedSize: Long,
        expectedSha256: String,
        expectedVersionName: String,
        expectedVersionCode: Long
    ) {
        require(apk.isFile && apk.length() == expectedSize) {
            "حجم ملف التحديث لا يطابق الإصدار المنشور."
        }
        require(sha256(apk).equals(expectedSha256, ignoreCase = true)) {
            "فشل التحقق من بصمة SHA-256؛ أُوقف التثبيت حفاظًا على سلامة التطبيق."
        }

        val archive = packageInfoFromArchive(apk)
            ?: error("الملف الذي تم تنزيله ليس حزمة APK صالحة.")
        require(archive.packageName == context.packageName) {
            "ملف التحديث لا يخص تطبيق برقيات الشرطة."
        }
        val archiveCode = versionCode(archive)
        require(archiveCode == expectedVersionCode) {
            "رقم بناء ملف APK لا يطابق رقم الإصدار المنشور."
        }
        require(archive.versionName == expectedVersionName) {
            "اسم إصدار ملف APK لا يطابق الإصدار المنشور."
        }
        require(archiveCode > currentVersionCode()) {
            "ملف التحديث ليس أحدث من النسخة المثبتة."
        }
        require(hasSameSigningCertificate(archive)) {
            "شهادة توقيع التحديث لا تطابق شهادة التطبيق المثبت؛ أُوقف التثبيت."
        }
    }

    private fun packageInfoFromArchive(apk: File): PackageInfo? {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
        return context.packageManager.getPackageArchiveInfo(apk.absolutePath, flags)
    }

    private fun installedPackageInfo(): PackageInfo {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
        return context.packageManager.getPackageInfo(context.packageName, flags)
    }

    private fun currentVersionCode(): Long = versionCode(installedPackageInfo())

    private fun versionCode(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }

    private fun hasSameSigningCertificate(archive: PackageInfo): Boolean {
        val installed = installedPackageInfo()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val installedSigners = installed.signingInfo?.apkContentsSigners
                ?.map { sha256(it.toByteArray()) }?.toSet().orEmpty()
            val archiveSigners = archive.signingInfo?.apkContentsSigners
                ?.map { sha256(it.toByteArray()) }?.toSet().orEmpty()
            return installedSigners.isNotEmpty() && installedSigners == archiveSigners
        }
        @Suppress("DEPRECATION")
        val installedSigners = installed.signatures?.map { sha256(it.toByteArray()) }?.toSet().orEmpty()
        @Suppress("DEPRECATION")
        val archiveSigners = archive.signatures?.map { sha256(it.toByteArray()) }?.toSet().orEmpty()
        return installedSigners.isNotEmpty() && installedSigners == archiveSigners
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") {
            (it.toInt() and 0xff).toString(16).padStart(2, '0')
        }
    }

    fun install(
        path: String,
        expectedSize: Long,
        expectedSha256: String,
        expectedVersionName: String,
        expectedVersionCode: Long
    ): String {
        val apk = File(path).canonicalFile
        val updateDirectory = File(context.cacheDir, UPDATE_DIRECTORY).canonicalFile
        require(apk.parentFile == updateDirectory && apk.name.endsWith(".apk", true)) {
            "مسار ملف التحديث غير صالح."
        }
        validateApk(apk, expectedSize, expectedSha256, expectedVersionName, expectedVersionCode)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            return INSTALL_PERMISSION_REQUIRED
        }

        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        ).apply { setSize(apk.length()) }
        val sessionId = installer.createSession(params)
        var session: PackageInstaller.Session? = null
        try {
            val installSession = installer.openSession(sessionId)
            session = installSession
            installSession.openWrite("base.apk", 0, apk.length()).use { output ->
                apk.inputStream().buffered().use { input -> input.copyTo(output) }
                installSession.fsync(output)
            }
            val callback = Intent(context, NativeInstallReceiver::class.java)
                .setPackage(context.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                INSTALL_REQUEST_CODE,
                callback,
                flags
            )
            session.commit(pendingIntent.intentSender)
            return "launched"
        } catch (failure: Throwable) {
            runCatching { installer.abandonSession(sessionId) }
            throw failure
        } finally {
            session?.close()
        }
    }

    fun openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settingsIntent)
        }
    }
}

class NativeInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE
        )
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirmationIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
            }
            confirmationIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let(context::startActivity)
        }
    }
}
