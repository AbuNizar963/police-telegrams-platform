const MAX_SOURCE_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_STORED_LOGO_BYTES = 2.5 * 1024 * 1024;
const INITIAL_MAX_DIMENSION = 1600;
const MINIMUM_DIMENSION = 256;

type OrganizationLogoContentType = "image/png" | "image/jpeg";

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة ملف الشعار بعد ضغطه"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const commaIndex = value.indexOf(",");
      if (commaIndex < 0) {
        reject(new Error("تعذر تجهيز ملف الشعار للرفع"));
        return;
      }
      resolve(value.slice(commaIndex + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Downsample organization logos before Base64 transport. The stored image stays
 * in its original PNG/JPEG format and within a payload size that Vercel accepts.
 */
export async function prepareOrganizationLogoUpload(
  file: File
): Promise<{ base64: string; contentType: OrganizationLogoContentType }> {
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
          base64: await readBlobAsBase64(blob),
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
