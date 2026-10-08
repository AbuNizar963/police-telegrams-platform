# قرار نماذج الصوت والكاميرا العربية

## الصوت

**الإملاء الفوري الافتراضي:** Web Speech API في المتصفح، مع تلميحات سياقية اختيارية لمصطلحات البرقيات وكلمات مثل «المدرسة». تظل دقته وتوافره تابعين للمتصفح، وقد يعيد فتح جلسات قصيرة أو يرسل الصوت إلى خدمة خارجية؛ لا تدعم كل المتصفحات العربية محليًا.

**الخيار المجاني بلا مفتاح API:** Whisper Small متعدد اللغات (`onnx-community/whisper-small`) عبر Transformers.js وONNX Runtime Web. يحمّل المستخدم النموذج عند الطلب (نحو 300 ميغابايت للموديل الكمي q4 مع ملفات التهيئة)، ثم يبقى الميكروفون مفتوحًا وتُفرّغ مقاطع مستقلة بالتتابع كل عدة ثوانٍ لعرض النص تدريجيًا أثناء الحديث. يعمل الاستدلال داخل Worker بعيدًا عن واجهة الصفحة. يستخدم WebGPU عند توافره، ويعود تلقائيًا إلى WASM/CPU؛ لا يرسل **التسجيل الصوتي** إلى Cohere أو خدمة التعرف في المتصفح. تحفظ أوزان النموذج في مخبأ المتصفح للاستخدامات التالية. الأداء يعتمد على الجهاز؛ وقد يتأخر ظهور النص على الأجهزة الأبطأ، ويكتمل آخر مقطع بعد الإيقاف. الحد الأقصى للجلسة 10 دقائق.

**المسار السحابي الاختياري عند تهيئة مفتاح Cohere:** Cohere Transcribe Arabic (`cohere-transcribe-arabic-07-2026`) نموذج ASR عربي مفتوح الأوزان بحجم 2B وترخيص Apache 2.0، مخصص للهجات العربية والخلط العربي–الإنكليزي. توثق Cohere متوسط WER قدره 25.87 على لوحة Open Universal Arabic ASR، مقابل 36.86 لـ Whisper Large V3 في جدول المقارنة المنشور. تتيح Cohere للمفاتيح التجريبية حدًا محدودًا؛ لذلك لا يعتمد خيار Whisper المحلي على مفتاح أو خدمة مدفوعة. [1] [2] [3]

## الكاميرا والصور

**الخيار السحابي الاختياري للدقة الأعلى:** PaddleOCR-VL، نموذج VLM مفتوح بترخيص Apache 2.0 بحجم 0.9B، يدعم العربية ضمن 109 لغات، ويستخرج النص وترتيب القراءة والجداول والعناصر المعقدة. وهو أنسب من Tesseract للصور الملتقطة بالكاميرا والوثائق ذات التخطيط المركب. [4]

لا يحمّل التطبيق PaddleOCR-VL داخل المتصفح أو Vercel: يحتاج النموذج بيئة Python ويفضل GPU، بينما دالة Vercel محدودة زمنيًا ولا تخزن أوزانًا دائمة. لذلك أضيفت خدمة FastAPI خاصة مرافقة في `ai-input-service/`، تتصل بها الواجهة عبر خادم التطبيق فقط. تستند نقطة التكامل إلى مسار PaddleOCR-VL الرسمي الذي يعيد `parsing_res_list` مرتبة بحسب ترتيب القراءة. [5]

يبقى Tesseract كبديل محلي بلا مفتاح حين لا تكون خدمة PaddleOCR-VL مهيأة. لا يُرسل ملف الصورة إلى الخدمة إلا عند تهيئتها؛ وبعد التحويل يمر النص بطبقة التصحيح العربية.

## تحسين الكتابة العربية

طبقة التصحيح تعمل بعد الصوت وOCR، وبحدود الكلمات فقط. تُصحح كلمات شائعة إضافية تنتهي بالتاء المربوطة، وتدعم الحركات والواو والفاء وحروف الجر المتصلة. لا يوجد استبدال شامل لكل هاء نهائية، حفاظًا على كلمات صحيحة مثل «وجه» و«مياه» و«تنبيه» و«توجيه». أُضيفت كذلك «المدرسة» إلى تلميحات التعرف السياقية؛ لا يمكن لأي نموذج ضمان انعدام الأخطاء، لذا تبقى مراجعة النص قبل إرسال البرقية مهمة.

## إعدادات الخادم الاختيارية

راجع [دليل تشغيل خدمة OCR المرافقة](../ai-input-service/README.md). لإتاحة المسارين السحابيين تتطلب البيئة `COHERE_API_KEY` و`PADDLEOCR_VL_URL` و`AI_INPUT_SERVICE_TOKEN`؛ لا تضع الأسرار في متغيرات تبدأ بـ`VITE_`. مسار Whisper المحلي يعمل دونها. لا تعتبر خدمة OCR مهيأة حتى يتوافر عنوانها **والسر المشترك**؛ ترفض الخدمة البدء بلا السر، وتتحقق من بصمة الصورة وحجمها قبل الاستدلال.

## مراجع الأبحاث

[1]: https://cohere.com/blog/transcribe-arabic "Cohere Transcribe Arabic"
[2]: https://docs.cohere.com/docs/transcribe-arabic "Cohere Transcribe Arabic documentation"
[3]: https://docs.cohere.com/docs/rate-limits "Cohere Trial API rate limits"
[4]: https://huggingface.co/PaddlePaddle/PaddleOCR-VL "PaddleOCR-VL model card"
[5]: https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PaddleOCR-VL.html "PaddleOCR-VL usage tutorial"
[6]: https://github.com/QwenLM/Qwen3-ASR "Qwen3-ASR open-source multilingual alternative"
[7]: https://docs.cohere.com/reference/create-audio-transcription "Cohere Audio Transcriptions API reference"
[8]: https://docs.cohere.com/v2/docs/audio-transcription-quickstart "Cohere Audio Transcription quickstart"

### تحديث أبحاث المتصفح — 6 أكتوبر 2026

توثيق MDN يصنف `SpeechRecognition` محدود التوافق وينبه إلى أن Chrome قد يرسل الصوت إلى خدمة تعرف خارجية. خصائص `processLocally` و`available()` و`install()` تجريبية؛ وقائمة اللغات المحلية المنشورة في شرح المواصفة لا تتضمن العربية حاليًا. [9] [10] [11]

تدعم بعض المتصفحات الانحياز السياقي عبر `SpeechRecognition.phrases` و`SpeechRecognitionPhrase` لإعطاء كلمات المجال مصداقية أعلى. هذه الواجهة تجريبية وقد لا تدعمها الخدمة أو المتصفح؛ تُستخدم بعد تحقق القدرات مع رجوع صامت إلى التعرف العادي، ولا يُفترض أنها تصحح الإملاء وحدها. [12] [13]

يعمل Whisper عبر Transformers.js داخل Web Worker، ويستفيد من WebGPU عند التوفر، ومن ONNX Runtime WASM عند غيابه. حجم تنزيل الأوزان كبير عمدًا لأنه خيار صريح لا يبدأ تلقائيًا؛ كما أن تحويل الصوت إلى PCM أحادي 16 كيلوهرتز يتم في المتصفح. [14] [15] [16]

[9]: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition "MDN: SpeechRecognition compatibility and server recognition note"
[10]: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally "MDN: processLocally"
[11]: https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md "Web Speech API: on-device speech recognition"
[12]: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/phrases "MDN: contextual phrases"
[13]: https://github.com/WebAudio/web-speech-api/blob/main/explainers/contextual-biasing.md "Web Speech API: contextual biasing explainer"
[14]: https://huggingface.co/docs/transformers.js/index "Transformers.js: browser ONNX, WebGPU and quantization"
[15]: https://huggingface.co/docs/transformers.js/pipelines "Transformers.js: ASR pipeline and browser cache"
[16]: https://huggingface.co/onnx-community/whisper-small "ONNX Community: multilingual Whisper Small for Transformers.js"
