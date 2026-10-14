package com.hadir.police.police_telegrams

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
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

class MainActivity : FlutterActivity() {
    private val installerChannel =
        "com.hadir.police.police_telegrams/apk_installer"
    private val updateNotificationChannel = "app_update_progress"
    private val updateNotificationId = 4107
    private var pendingNotificationPermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        createUpdateNotificationChannel()
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, installerChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "requestUpdateNotificationPermission" -> {
                        requestUpdateNotificationPermission(result)
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
                        val progress = (call.argument<Int>("progress") ?: 0).coerceIn(0, 100)
                        val received = call.argument<Int>("received") ?: 0
                        val total = call.argument<Int>("total") ?: 0
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

    private fun formatBytes(bytes: Int): String {
        val megabytes = bytes / (1024.0 * 1024.0)
        return String.format(java.util.Locale.ROOT, "%.1f MB", megabytes)
    }

    private fun installApk(call: io.flutter.plugin.common.MethodCall, result: MethodChannel.Result) {
        val path = call.argument<String>("path")
        if (path.isNullOrBlank()) {
            result.error("INVALID_PATH", "مسار ملف التحديث غير صالح.", null)
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

    companion object {
        private const val NOTIFICATION_PERMISSION_REQUEST = 4108
    }
}
