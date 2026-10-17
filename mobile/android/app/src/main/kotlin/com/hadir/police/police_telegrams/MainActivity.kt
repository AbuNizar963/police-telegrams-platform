package com.police.police_telegrams

import com.police.police_telegrams.R
import android.Manifest
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.IOException
import java.security.MessageDigest

class MainActivity : FlutterActivity() {
    private val installerChannel =
        "com.police.police_telegrams/apk_installer"
    private val updateNotificationChannel = "app_update_progress"
    private val updateNotificationId = 4107
    private var pendingNotificationPermissionResult: MethodChannel.Result? = null
    private var telegramNotificationMethodChannel: MethodChannel? = null
    private var telegramNotificationHandlerReady = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        createUpdateNotificationChannel()
        createTelegramNotificationChannels()
        telegramNotificationMethodChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            TELEGRAM_NOTIFICATION_METHOD_CHANNEL
        ).apply {
            setMethodCallHandler { call, result ->
                when (call.method) {
                    "showTelegramNotification" -> showTelegramNotification(call, result)
                    "markTelegramNotificationHandlerReady" ->
                        markTelegramNotificationHandlerReady(result)
                    "markTelegramNotificationHandlerNotReady" -> {
                        telegramNotificationHandlerReady = false
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
        }
        handleTelegramNotificationIntent(intent)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, installerChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "requestUpdateNotificationPermission" -> {
                        requestUpdateNotificationPermission(result)
                    }
                    "enqueueBackgroundDownload" -> enqueueBackgroundDownload(call, result)
                    "queryBackgroundDownload" -> queryBackgroundDownload(call, result)
                    "getPendingUpdate" -> getPendingUpdate(result)
                    "clearPendingUpdate" -> {
                        clearPendingUpdate()
                        result.success(null)
                    }
                    "startUpdateNotification" -> {
                        showUpdateNotification(
                            title = "جارٍ تنزيل تحديث برقيات الشرطة",
                            message = "يبدأ تنزيل ملف التحديث...",
                            progress = 0,
                            ongoing = true
                        )
                        result.success(null)
                    }
                    "updateDownloadNotification" -> {
                        // StandardMessageCodec may decode Dart integers as either
                        // java.lang.Integer or java.lang.Long. Read numeric channel
                        // values through Number to avoid a runtime ClassCastException.
                        val progress = (call.argument<Number>("progress")?.toInt() ?: 0)
                            .coerceIn(0, 100)
                        val received = (call.argument<Number>("received")?.toLong() ?: 0L)
                            .coerceAtLeast(0L)
                        val total = (call.argument<Number>("total")?.toLong() ?: 0L)
                            .coerceAtLeast(0L)
                        val message = if (total > 0) {
                            "اكتمل $progress% • ${formatBytes(received)} من ${formatBytes(total)}"
                        } else {
                            "اكتمل $progress%"
                        }
                        showUpdateNotification(
                            title = "جارٍ تنزيل تحديث برقيات الشرطة",
                            message = message,
                            progress = progress,
                            ongoing = true
                        )
                        result.success(null)
                    }
                    "completeUpdateNotification" -> {
                        showUpdateNotification(
                            title = "اكتمل تنزيل التحديث",
                            message = "تم تنزيل الملف بنجاح. اضغط للعودة إلى التطبيق ومتابعة التثبيت.",
                            progress = 100,
                            ongoing = false,
                            completed = true
                        )
                        result.success(null)
                    }
                    "failUpdateNotification" -> {
                        cancelUpdateNotification()
                        result.success(null)
                    }
                    "openInstallSettings" -> {
                        try {
                            val settingsIntent = Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:$packageName")
                            )
                            startActivity(settingsIntent)
                            result.success("opened")
                        } catch (error: Exception) {
                            result.error(
                                "SETTINGS_FAILED",
                                error.message ?: "تعذر فتح إعدادات السماح بالتثبيت.",
                                null
                            )
                        }
                    }
                    "installApk" -> installApk(call, result)
                    else -> result.notImplemented()
                }
            }
    }

    private fun enqueueBackgroundDownload(
        call: io.flutter.plugin.common.MethodCall,
        result: MethodChannel.Result
    ) {
        val url = call.argument<String>("url")
        val expectedSize = (call.argument<Number>("expectedSize"))?.toLong()
        val expectedSha256 = call.argument<String>("expectedSha256")
            ?.trim()
            ?.lowercase(java.util.Locale.ROOT)
        val releaseVersion = call.argument<String>("version")?.trim()
        val buildNumber = call.argument<Number>("buildNumber")?.toInt() ?: 0
        val downloadUri = url?.let { Uri.parse(it) }
        if (downloadUri == null || downloadUri.scheme != "https" ||
            downloadUri.host != "github.com" ||
            !downloadUri.path.orEmpty().contains("/releases/download/")
        ) {
            result.error("INVALID_DOWNLOAD_URL", "رابط التحديث غير صالح.", null)
            return
        }
        if (expectedSha256 == null || !SHA256_PATTERN.matches(expectedSha256)) {
            result.error("INVALID_CHECKSUM", "بصمة ملف التحديث غير صالحة.", null)
            return
        }
        if (expectedSize == null || expectedSize <= 0L || releaseVersion.isNullOrBlank() ||
            buildNumber <= 0
        ) {
            result.error("INVALID_UPDATE_METADATA", "بيانات إصدار التحديث غير مكتملة.", null)
            return
        }
        try {
            val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle("تحديث برقيات الشرطة")
                setDescription("يستمر تنزيل التحديث في الخلفية")
                // Keep Android's DownloadManager notification visible during
                // the transfer so users can track progress from the notification shade.
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE
                )
                setAllowedOverMetered(true)
                setAllowedOverRoaming(false)
                setDestinationInExternalFilesDir(
                    this@MainActivity,
                    android.os.Environment.DIRECTORY_DOWNLOADS,
                    "police-telegrams-update.apk"
                )
                setMimeType("application/vnd.android.package-archive")
            }
            val id = manager.enqueue(request)
            getSharedPreferences("app_update", Context.MODE_PRIVATE)
                .edit()
                .putLong("download_id", id)
                .putLong("expected_size", expectedSize)
                .putString("expected_sha256", expectedSha256)
                .putString("release_version", releaseVersion)
                .putInt("release_build_number", buildNumber)
                .apply()
            result.success(id)
        } catch (error: Exception) {
            result.error(
                "DOWNLOAD_ENQUEUE_FAILED",
                error.message ?: "تعذر بدء التنزيل في الخلفية.",
                null
            )
        }
    }

    private fun getPendingUpdate(result: MethodChannel.Result) {
        val preferences = getSharedPreferences("app_update", Context.MODE_PRIVATE)
        val id = preferences.getLong("download_id", -1L)
        if (id < 0L) {
            result.success(null)
            return
        }
        result.success(
            mapOf(
                "id" to id,
                "expectedSize" to preferences.getLong("expected_size", -1L),
                "expectedSha256" to preferences.getString("expected_sha256", null),
                "version" to preferences.getString("release_version", null),
                "buildNumber" to preferences.getInt("release_build_number", 0)
            )
        )
    }

    private fun clearPendingUpdate() {
        val preferences = getSharedPreferences("app_update", Context.MODE_PRIVATE)
        val id = preferences.getLong("download_id", -1L)
        if (id >= 0L) {
            try {
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(id)
            } catch (_: Exception) {
                // The system may already have removed an expired download record.
            }
        }
        preferences.edit().clear().apply()
        getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS)
            ?.let { File(it, "police-telegrams-update.apk").delete() }
        File(cacheDir, "updates/police-telegrams-update.apk").delete()
        cancelUpdateNotification()
    }

    private fun queryBackgroundDownload(
        call: io.flutter.plugin.common.MethodCall,
        result: MethodChannel.Result
    ) {
        val id = call.argument<Number>("id")?.toLong()
            ?: getSharedPreferences("app_update", Context.MODE_PRIVATE)
                .getLong("download_id", -1L)
        if (id < 0L) {
            result.success(mapOf("status" to "not_found"))
            return
        }
        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        var cursor: Cursor? = null
        try {
            cursor = manager.query(DownloadManager.Query().setFilterById(id))
            if (cursor == null || !cursor.moveToFirst()) {
                result.success(mapOf("status" to "not_found"))
                return
            }
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val downloaded = cursor.getLong(
                cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
            )
            val total = cursor.getLong(
                cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
            )
            val statusName = when (status) {
                DownloadManager.STATUS_PENDING -> "pending"
                DownloadManager.STATUS_RUNNING -> "running"
                DownloadManager.STATUS_PAUSED -> "paused"
                DownloadManager.STATUS_SUCCESSFUL -> "successful"
                DownloadManager.STATUS_FAILED -> "failed"
                else -> "unknown"
            }
            // DownloadManager may expose COLUMN_LOCAL_URI as a content:// URI.
            // Dart's Uri.toFilePath() cannot convert that URI, which prevented the
            // installer from opening an otherwise completed download. The request
            // uses setDestinationInExternalFilesDir(), so resolve that known target
            // directly and return a file:// URI that Dart can safely convert.
            val downloadedApk = getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS)
                ?.let { File(it, "police-telegrams-update.apk") }
            val uri = if (status == DownloadManager.STATUS_SUCCESSFUL &&
                downloadedApk != null && downloadedApk.isFile
            ) {
                Uri.fromFile(downloadedApk).toString()
            } else null
            val reason = if (status == DownloadManager.STATUS_FAILED) {
                cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
            } else 0
            result.success(
                mapOf(
                    "id" to id,
                    "status" to statusName,
                    "downloaded" to downloaded,
                    "total" to total,
                    "localUri" to uri,
                    "reason" to reason
                )
            )
        } catch (error: Exception) {
            result.error("DOWNLOAD_QUERY_FAILED", error.message, null)
        } finally {
            cursor?.close()
        }
    }

    private fun requestUpdateNotificationPermission(result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            result.success(true)
            return
        }
        if (pendingNotificationPermissionResult != null) {
            result.error("PERMISSION_PENDING", "طلب إذن الإشعارات قيد التنفيذ.", null)
            return
        }
        pendingNotificationPermissionResult = result
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            NOTIFICATION_PERMISSION_REQUEST
        )
    }

    @Deprecated("Deprecated in Android API")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            val granted = grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingNotificationPermissionResult?.success(granted)
            pendingNotificationPermissionResult = null
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleTelegramNotificationIntent(intent)
    }

    private fun createTelegramNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val soundUri = Uri.parse(
            "android.resource://$packageName/${R.raw.police_telegram_alert}"
        )
        val soundAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val notificationManager = getSystemService(NotificationManager::class.java)

        val generalChannel = NotificationChannel(
            TELEGRAM_GENERAL_CHANNEL_ID,
            "برقيات جديدة",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "إشعارات البرقيات الجديدة الواردة والصادرة"
            setSound(soundUri, soundAttributes)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 160, 90, 160)
        }
        val urgentChannel = NotificationChannel(
            TELEGRAM_URGENT_CHANNEL_ID,
            "برقيات عاجلة وطارئة",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "تنبيهات فورية للبرقيات العاجلة والطارئة"
            setSound(soundUri, soundAttributes)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 300, 120, 300, 120, 300)
        }

        notificationManager.createNotificationChannels(
            listOf(generalChannel, urgentChannel)
        )
    }

    private fun showTelegramNotification(
        call: io.flutter.plugin.common.MethodCall,
        result: MethodChannel.Result
    ) {
        val telegramId = call.argument<Number>("telegramId")?.toInt() ?: 0
        if (telegramId <= 0) {
            result.error("INVALID_TELEGRAM_ID", "معرّف البرقية غير صالح.", null)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            result.success(false)
            return
        }

        val urgent = call.argument<Boolean>("urgent") == true
        val channelId = if (urgent) {
            TELEGRAM_URGENT_CHANNEL_ID
        } else {
            TELEGRAM_GENERAL_CHANNEL_ID
        }
        val defaultTitle = if (urgent) "تنبيه برقية عاجلة" else "برقية جديدة"
        val title = call.argument<String>("title")
            ?.trim()
            .orEmpty()
            .ifBlank { defaultTitle }
        val body = call.argument<String>("body")
            ?.trim()
            .orEmpty()
            .ifBlank { "وصلت برقية جديدة إلى جهتك." }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(this, MainActivity::class.java)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        launchIntent.putExtra(EXTRA_TELEGRAM_NOTIFICATION_ID, telegramId)

        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_IMMUTABLE
            } else {
                0
            }
        val contentIntent = PendingIntent.getActivity(
            this,
            telegramId,
            launchIntent,
            pendingIntentFlags
        )
        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_stat_police_telegram)
            .setColor(android.graphics.Color.rgb(16, 35, 63))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(
                if (urgent) NotificationCompat.PRIORITY_MAX
                else NotificationCompat.PRIORITY_HIGH
            )
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder
                .setSound(
                    Uri.parse(
                        "android.resource://$packageName/${R.raw.police_telegram_alert}"
                    )
                )
                .setVibrate(
                if (urgent) longArrayOf(0, 300, 120, 300, 120, 300)
                else longArrayOf(0, 160, 90, 160)
                )
        }

        try {
            NotificationManagerCompat.from(this).notify(
                "telegram-$telegramId",
                telegramId,
                builder.build()
            )
            result.success(true)
        } catch (error: SecurityException) {
            result.success(false)
        } catch (error: Exception) {
            result.error(
                "SHOW_TELEGRAM_NOTIFICATION_FAILED",
                error.message ?: "تعذر عرض إشعار البرقية.",
                null
            )
        }
    }

    private fun markTelegramNotificationHandlerReady(result: MethodChannel.Result) {
        telegramNotificationHandlerReady = true
        val preferences = getSharedPreferences(
            TELEGRAM_NOTIFICATION_PREFERENCES,
            Context.MODE_PRIVATE
        )
        val pendingId = preferences.getInt(PENDING_TELEGRAM_NOTIFICATION_ID, 0)
        preferences.edit().remove(PENDING_TELEGRAM_NOTIFICATION_ID).apply()
        result.success(pendingId.takeIf { it > 0 })
    }

    private fun handleTelegramNotificationIntent(notificationIntent: Intent?) {
        if (notificationIntent == null) return
        val telegramId = notificationIntent.getIntExtra(
            EXTRA_TELEGRAM_NOTIFICATION_ID,
            0
        )
        if (telegramId <= 0) return
        notificationIntent.removeExtra(EXTRA_TELEGRAM_NOTIFICATION_ID)

        if (telegramNotificationHandlerReady) {
            telegramNotificationMethodChannel?.invokeMethod(
                "onTelegramNotificationOpened",
                telegramId
            )
        } else {
            getSharedPreferences(
                TELEGRAM_NOTIFICATION_PREFERENCES,
                Context.MODE_PRIVATE
            ).edit().putInt(PENDING_TELEGRAM_NOTIFICATION_ID, telegramId).apply()
        }
    }

    private fun createUpdateNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                updateNotificationChannel,
                "تحديث التطبيق",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "تقدم تنزيل تحديثات تطبيق برقيات الشرطة"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun showUpdateNotification(
        title: String,
        message: String,
        progress: Int,
        ongoing: Boolean,
        completed: Boolean = false
    ) {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                4107,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
        val builder = NotificationCompat.Builder(this, updateNotificationChannel)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(ongoing)
            .setAutoCancel(false)
            .setProgress(100, progress.coerceIn(0, 100), false)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        if (pendingIntent != null) builder.setContentIntent(pendingIntent)
        if (completed) {
            builder.setOngoing(false)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setProgress(0, 0, false)
        }
        try {
            NotificationManagerCompat.from(this).notify(updateNotificationId, builder.build())
        } catch (error: SecurityException) {
            // Notifications can be disabled in Android settings at any time.
        }
    }

    private fun cancelUpdateNotification() {
        NotificationManagerCompat.from(this).cancel(updateNotificationId)
    }

    private fun formatBytes(bytes: Long): String {
        val megabytes = bytes / (1024.0 * 1024.0)
        return String.format(java.util.Locale.ROOT, "%.1f MB", megabytes)
    }

    private fun installApk(call: io.flutter.plugin.common.MethodCall, result: MethodChannel.Result) {
        val path = call.argument<String>("path")
        val expectedSha256 = call.argument<String>("expectedSha256")
            ?.trim()
            ?.lowercase(java.util.Locale.ROOT)
        if (path.isNullOrBlank()) {
            result.error("INVALID_PATH", "مسار ملف التحديث غير صالح.", null)
            return
        }
        if (expectedSha256 == null || !SHA256_PATTERN.matches(expectedSha256)) {
            result.error("INVALID_CHECKSUM", "بصمة ملف التحديث غير صالحة.", null)
            return
        }

        val downloadedApk = File(path)
        if (!downloadedApk.isFile || !downloadedApk.name.endsWith(".apk", true)) {
            result.error("APK_NOT_FOUND", "ملف التحديث غير موجود.", null)
            return
        }
        if (downloadedApk.length() <= 0L) {
            result.error("APK_EMPTY", "ملف التحديث فارغ؛ أعد تنزيله.", null)
            return
        }

        try {
            if (sha256(downloadedApk) != expectedSha256) {
                result.error(
                    "APK_CHECKSUM_MISMATCH",
                    "لا تطابق بصمة ملف التحديث البصمة المنشورة؛ أُوقف التثبيت حفاظًا على سلامة التطبيق.",
                    null
                )
                return
            }
            val updateDirectory = File(cacheDir, "updates")
            if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                throw IOException("تعذر تجهيز مجلد تثبيت التحديث.")
            }
            val installApk = File(updateDirectory, "police-telegrams-update.apk")
            if (downloadedApk.canonicalFile != installApk.canonicalFile) {
                downloadedApk.inputStream().use { input ->
                    installApk.outputStream().use { output ->
                        input.copyTo(output)
                        output.fd.sync()
                    }
                }
            }
            if (!installApk.isFile || installApk.length() != downloadedApk.length()) {
                installApk.delete()
                throw IOException("تعذر تجهيز ملف التحديث للتثبيت.")
            }
            if (sha256(installApk) != expectedSha256) {
                installApk.delete()
                result.error(
                    "APK_CHECKSUM_MISMATCH",
                    "فشل التحقق من سلامة نسخة التثبيت؛ أُوقف التثبيت.",
                    null
                )
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !packageManager.canRequestPackageInstalls()
            ) {
                result.success("permission_required")
                return
            }

            val apkUri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                installApk
            )
            val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(installIntent)
            result.success("launched")
        } catch (error: Exception) {
            result.error(
                "INSTALL_FAILED",
                error.message ?: "تعذر بدء تثبيت التحديث.",
                null
            )
        }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { byte ->
            (byte.toInt() and 0xff).toString(16).padStart(2, '0')
        }
    }

    companion object {
        private const val NOTIFICATION_PERMISSION_REQUEST = 4108
        private const val TELEGRAM_NOTIFICATION_METHOD_CHANNEL =
            "com.police.police_telegrams/telegram_notifications"
        private const val TELEGRAM_GENERAL_CHANNEL_ID = "police_telegram_general_v1"
        private const val TELEGRAM_URGENT_CHANNEL_ID = "police_telegram_urgent_v1"
        private const val TELEGRAM_NOTIFICATION_PREFERENCES = "telegram_notification_state"
        private const val PENDING_TELEGRAM_NOTIFICATION_ID = "pending_telegram_id"
        private const val EXTRA_TELEGRAM_NOTIFICATION_ID =
            "com.police.police_telegrams.extra.TELEGRAM_NOTIFICATION_ID"
        private val SHA256_PATTERN = Regex("^[a-f0-9]{64}$")
    }
}
