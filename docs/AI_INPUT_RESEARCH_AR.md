# قرار نماذج الصوت والكاميرا العربية

**النموذج المختار للصوت هو Cohere Transcribe Arabic (`cohere-transcribe-arabic-07-2026`).** هو نموذج ASR عربي مفتوح الأوزان بحجم 2B وترخيص Apache 2.0، مخصص للهجات العربية والخلط العربي–الإنكليزي. توثق Cohere أن النسخة العربية حققت متوسط WER قدره 25.87 على لوحة Open Universal Arabic ASR، مقابل 36.86 لـ Whisper Large V3 في جدول المقارنة المنشور؛ لذا هو اختيار أقوى من Web Speech API العام المستخدم سابقًا لهذا التطبيق. [1] [2]

يستدعى النموذج من الخادم فقط عبر Cohere Audio Transcriptions API. الواجهة تسجل الصوت محليًا، وتحوله إلى WAV أحادي القناة، ثم ترسله إلى خادم التطبيق الموثق؛ لا يرى المتصفح مفتاح Cohere. تذكر وثائق API حد 25 ميغابايت وتطلب ملف WAV/OGG/MP3 ونموذجًا ولغةً في `multipart/form-data`. إتاحة API التجريبية مجانية ومحدودة المعدل: حد التفريغ الصوتي 5 طلبات في الدقيقة، ومفاتيح Trial محدودة بـ 1,000 طلب شهريًا. [3] [4] [8]

**النموذج المختار للكاميرا/الصور هو PaddleOCR-VL.** هذا نموذج VLM مفتوح بترخيص Apache 2.0 بحجم 0.9B، يدعم العربية ضمن 109 لغات، ويستخرج النص وترتيب القراءة والجداول والعناصر المعقدة. وهو أنسب من Tesseract للصور الملتقطة بالكاميرا والوثائق ذات التخطيط المركب. [5]

لا يحمّل التطبيق PaddleOCR-VL داخل المتصفح أو Vercel: النموذج يحتاج بيئة Python ويفضل GPU، بينما دالة Vercel محدودة زمنيًا ولا تخزن أوزانًا دائمة. لذلك أضيفت خدمة FastAPI خاصة مرافقة في `ai-input-service/`، تتصل بها الواجهة عبر خادم التطبيق فقط. تستند نقطة التكامل إلى مسار PaddleOCR-VL الرسمي الذي يعيد `parsing_res_list` مرتبة بحسب ترتيب القراءة. [6]

يبقى Tesseract كبديل محلي بلا مفتاح حين لا تكون خدمة PaddleOCR-VL مهيأة، ويبقى Web Speech كبديل حين لا يوجد مفتاح Cohere. هذا يمنع تعطل إدخال البرقية عند انقطاع خدمة خارجية، لكنه لا يُعرض كخيار الدقة الأعلى.

## التاء المربوطة

طبقة التصحيح العربي تعمل بعد كلا المسارين (الصوت وOCR)، وبحدود الكلمات فقط. تُصحح كلمات شائعة إضافية تنتهي بالتاء المربوطة، وتدعم الحركات والواو والفاء وحروف الجر المتصلة. لا يوجد استبدال شامل لكل هاء نهائية، حفاظًا على كلمات صحيحة مثل «وجه» و«مياه» و«تنبيه» و«توجيه». نموذج Cohere العربي الأحدث يقلل الخطأ من المصدر عند ضبط مفتاحه؛ ويظل التعرف المدمج في المتصفح بديلًا مجانيًا عند عدم وجود المفتاح. نظرًا لأن الواجهة تعيد إرسال التسجيل الكامل عند الإيقاف للمحرك المحسن، يجب مراعاة سياسة المؤسسة قبل إرسال محتوى حساس إلى خدمة خارجية.

## الإعداد المطلوب

راجع [دليل تشغيل الخدمة المرافقة](../ai-input-service/README.md). مفاتيح وخيارات الخادم المطلوبة هي `COHERE_API_KEY` و`PADDLEOCR_VL_URL` و`AI_INPUT_SERVICE_TOKEN`، ولا يجوز وضعها في متغيرات تبدأ بـ`VITE_`. لا تعتبر ميزة OCR مهيأة حتى يتوافر عنوان الخدمة **والسر المشترك**؛ ترفض الخدمة البدء بلا السر، وتتحقق من بصمة الصورة وحجمها قبل الاستدلال.

## المراجع

[1]: https://cohere.com/blog/transcribe-arabic "Meet Cohere Transcribe Arabic"
[2]: https://docs.cohere.com/docs/transcribe-arabic "Cohere Transcribe Arabic documentation"
[3]: https://docs.cohere.com/reference/create-audio-transcription "Cohere Audio Transcriptions API reference"
[4]: https://docs.cohere.com/v2/docs/audio-transcription-quickstart "Cohere Audio Transcription quickstart"
[5]: https://huggingface.co/PaddlePaddle/PaddleOCR-VL "PaddleOCR-VL model card"
[6]: https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PaddleOCR-VL.html "PaddleOCR-VL usage tutorial"
[7]: https://github.com/QwenLM/Qwen3-ASR "Qwen3-ASR open-source multilingual alternative"
[8]: https://docs.cohere.com/docs/rate-limits "Cohere Trial API rate limits"
