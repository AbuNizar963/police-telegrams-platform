import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

const PAGE_IMAGE_DPI = 192;

export async function pdfPagesToPngArchive(pdf: Blob): Promise<Blob> {
  const [{ GlobalWorkerOptions, getDocument }, { zipSync }] = await Promise.all(
    [import("pdfjs-dist"), import("fflate")]
  );
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({
    data: new Uint8Array(await pdf.arrayBuffer()),
  });
  const document = await loadingTask.promise;
  const files: Record<string, Uint8Array> = {};

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PAGE_IMAGE_DPI / 72 });
      const canvas = window.document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("تعذر تجهيز مساحة تحويل صورة الصفحة.");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const png = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          value =>
            value
              ? resolve(value)
              : reject(new Error("تعذر تصدير صورة إحدى صفحات البرقية.")),
          "image/png"
        );
      });
      files[`telegram-page-${String(pageNumber).padStart(2, "0")}.png`] =
        new Uint8Array(await png.arrayBuffer());
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  if (Object.keys(files).length < 2) {
    throw new Error("لم ينتج التصدير أكثر من صفحة واحدة.");
  }
  return new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
}
