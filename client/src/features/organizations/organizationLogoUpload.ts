const MAX_SOURCE_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_STORED_LOGO_BYTES = 2.5 * 1024 * 1024;
const INITIAL_MAX_DIMENSION = 1600;
const MINIMUM_DIMENSION = 256;

type OrganizationLogoContentType = "image/png" | "image/jpeg";

/**
 * Downsample organization logos before binary transport. The image stays in its
 * original PNG/JPEG format and within the server's strict upload size limit.
 */
export async function prepareOrganizationLogoUpload(
  file: File
): Promise<{ blob: Blob; contentType: OrganizationLogoContentType }> {
  if (file.size === 0) throw new Error("ملف الشعار فارغ");
  if (file.size > MAX_SOURCE_LOGO_BYTES) {
    throw new Error("حجم ملف الشعار الأصلي يجب ألا يتجاوز 5 ميغابايت");
  }
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    throw new Error("صيغة الشعار يجب أن تكون PNG أو JPG");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error("ملف الشعار ليس صورة صالحة");
    }
    if (
      image.naturalWidth > 12_000 ||
      image.naturalHeight > 12_000 ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    ) {
      throw new Error("أبعاد صورة الشعار كبيرة جدًا؛ استخدم صورة أصغر");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز صورة الشعار للرفع");

    let maxDimension = INITIAL_MAX_DIMENSION;
    let quality = 0.9;
    while (true) {
      const scale = Math.min(
        1,
        maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, file.type, quality)
      );
      if (!blob || blob.type !== file.type) {
        throw new Error("تعذر ضغط شعار الجهة إلى الصيغة المطلوبة");
      }
      if (blob.size <= MAX_STORED_LOGO_BYTES) {
        return {
          blob,
          contentType: file.type,
        };
      }
      if (maxDimension <= MINIMUM_DIMENSION) {
        throw new Error("تعذر ضغط الشعار إلى الحد المسموح؛ اختر صورة أصغر");
      }

      maxDimension = Math.max(
        MINIMUM_DIMENSION,
        Math.floor(maxDimension * 0.75)
      );
      if (file.type === "image/jpeg") {
        quality = Math.max(0.72, quality - 0.06);
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export type UploadedOrganizationLogo = {
  key: string;
  url: string;
};

/**
 * Upload a prepared logo as raw bytes through the authenticated application API.
 */
export async function uploadOrganizationLogoDirect(input: {
  organizationId: string;
  fileName: string;
  blob: Blob;
  contentType: OrganizationLogoContentType;
}): Promise<UploadedOrganizationLogo> {
  const response = await fetch("/api/storage/department-logo", {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": input.contentType,
      "X-Organization-Id": input.organizationId,
      "X-File-Name": encodeURIComponent(input.fileName),
    },
    body: input.blob,
  });

  const result = (await response.json().catch(() => null)) as
    | (UploadedOrganizationLogo & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(result?.error || "تعذر رفع شعار الجهة");
  }
  if (
    !result ||
    typeof result.key !== "string" ||
    typeof result.url !== "string"
  ) {
    throw new Error("استجابة الخادم لرفع الشعار غير صالحة");
  }
  return { key: result.key, url: result.url };
}
