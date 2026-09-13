import type { ToolDef, ToolGroup, Runtime } from "./types.ts";

export const MB = 1024 * 1024;

const PDF = ["application/pdf"] as const;
const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif", "image/bmp", "image/tiff"] as const;
const OFFICE_WORD = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.oasis.opendocument.text"] as const;
const OFFICE_PPT = ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.oasis.opendocument.presentation"] as const;
const OFFICE_XLS = ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet"] as const;

type Input = {
  id: string;
  group: ToolGroup;
  runtime: Runtime;
  accepts?: readonly string[];
  input?: "text";
  maxFiles?: number;
  credits?: number;
  phase: ToolDef["phase"];
  ar: [name: string, summary: string];
  en: [name: string, summary: string];
};

function def(t: Input): ToolDef {
  const [arName, arSummary] = t.ar;
  const [enName, enSummary] = t.en;
  const apiGroup = t.group === "image" || (t.group === "ai" && t.id !== "summarize-pdf" && t.id !== "translate-pdf") ? "image" : "pdf";
  return {
    id: t.id,
    group: t.group,
    runtime: t.runtime,
    input: t.input ?? "files",
    accepts: t.accepts ?? PDF,
    limits: { maxFiles: t.maxFiles ?? 1, maxBytes: 25 * MB },
    api: { path: `/v1/${apiGroup}/${t.id.replace(/-(pdf|image|images)$/, "")}`, credits: t.credits ?? 1 },
    phase: t.phase,
    copy: {
      ar: { name: arName, summary: arSummary },
      en: { name: enName, summary: enSummary },
    },
  };
}

export const TOOLS: readonly ToolDef[] = [
  // Organize PDF
  def({ id: "merge-pdf", group: "organize", runtime: "browser", maxFiles: 50, phase: 1,
    ar: ["دمج PDF", "اجمع عدة ملفات في ملف واحد بالترتيب الذي تريده."],
    en: ["Merge PDF", "Combine several PDFs into one file, in the order you want."] }),
  def({ id: "split-pdf", group: "organize", runtime: "browser", phase: 1,
    ar: ["تقسيم PDF", "افصل الصفحات أو نطاقات منها إلى ملفات مستقلة."],
    en: ["Split PDF", "Separate pages or page ranges into their own files."] }),
  def({ id: "remove-pages", group: "organize", runtime: "browser", phase: 1,
    ar: ["حذف صفحات", "أزل الصفحات التي لا تحتاجها من الملف."],
    en: ["Remove pages", "Delete the pages you don't need from a PDF."] }),
  def({ id: "extract-pages", group: "organize", runtime: "browser", phase: 1,
    ar: ["استخراج صفحات", "انسخ صفحات محددة إلى ملف جديد."],
    en: ["Extract pages", "Copy selected pages into a new PDF."] }),
  def({ id: "organize-pdf", group: "organize", runtime: "browser", maxFiles: 20, phase: 1,
    ar: ["ترتيب الصفحات", "رتّب الصفحات بالسحب أو دوّرها."],
    en: ["Organize PDF", "Drag pages to reorder them, or rotate them."] }),
  def({ id: "scan-to-pdf", group: "organize", runtime: "browser", accepts: IMAGES, maxFiles: 100, phase: 1,
    ar: ["مسح ضوئي إلى PDF", "صوّر المستندات بكاميرا هاتفك وحوّلها إلى PDF."],
    en: ["Scan to PDF", "Photograph documents with your phone and turn them into a PDF."] }),

  // Optimize PDF
  def({ id: "compress-pdf", group: "optimize", runtime: "server", maxFiles: 10, phase: 3,
    ar: ["ضغط PDF", "قلّل حجم الملف مع الحفاظ على وضوح النص والصور."],
    en: ["Compress PDF", "Reduce file size while keeping text and images sharp."] }),
  def({ id: "repair-pdf", group: "optimize", runtime: "server", phase: 3,
    ar: ["إصلاح PDF", "استعد محتوى ملف تالف أو لا يُفتح."],
    en: ["Repair PDF", "Recover the content of a damaged PDF that won't open."] }),
  def({ id: "ocr-pdf", group: "optimize", runtime: "server", accepts: [...PDF, ...IMAGES], credits: 3, phase: 4,
    ar: ["التعرّف الضوئي على الحروف (OCR)", "حوّل المستندات الممسوحة ضوئيًا إلى نص عربي قابل للبحث والنسخ."],
    en: ["OCR PDF", "Turn scanned documents into searchable, copyable Arabic and English text."] }),

  // Convert to PDF
  def({ id: "jpg-to-pdf", group: "to-pdf", runtime: "browser", accepts: IMAGES, maxFiles: 100, phase: 1,
    ar: ["JPG إلى PDF", "اجمع صورك في ملف PDF واحد."],
    en: ["JPG to PDF", "Combine your images into one PDF."] }),
  def({ id: "word-to-pdf", group: "to-pdf", runtime: "server", accepts: OFFICE_WORD, maxFiles: 10, phase: 3,
    ar: ["Word إلى PDF", "حوّل ملفات DOC وDOCX مع الحفاظ على التنسيق."],
    en: ["Word to PDF", "Convert DOC and DOCX files while keeping the formatting."] }),
  def({ id: "powerpoint-to-pdf", group: "to-pdf", runtime: "server", accepts: OFFICE_PPT, maxFiles: 10, phase: 3,
    ar: ["PowerPoint إلى PDF", "حوّل العروض التقديمية إلى PDF."],
    en: ["PowerPoint to PDF", "Convert presentations to PDF."] }),
  def({ id: "excel-to-pdf", group: "to-pdf", runtime: "server", accepts: OFFICE_XLS, maxFiles: 10, phase: 3,
    ar: ["Excel إلى PDF", "حوّل جداول البيانات إلى صفحات مرتبة."],
    en: ["Excel to PDF", "Convert spreadsheets into neatly laid-out pages."] }),
  def({ id: "markdown-editor", group: "to-pdf", runtime: "browser", input: "text", accepts: ["text/markdown", "text/plain"], phase: 1,
    ar: ["محرر Markdown", "افتح ملف ‎.md واقرأه بمعاينة فورية، وعدّله، ثم صدّره PDF أو Word أو HTML."],
    en: ["Markdown editor", "Open a .md file with a live preview, edit it, and export it to PDF, Word or HTML."] }),
  def({ id: "html-to-pdf", group: "to-pdf", runtime: "server", accepts: ["text/html"], phase: 3,
    ar: ["HTML إلى PDF", "حوّل صفحة ويب إلى PDF برابطها."],
    en: ["HTML to PDF", "Turn a web page into a PDF from its link."] }),

  // Convert from PDF
  def({ id: "pdf-to-jpg", group: "from-pdf", runtime: "browser", maxFiles: 10, phase: 1,
    ar: ["PDF إلى JPG", "حوّل كل صفحة إلى صورة أو استخرج الصور المضمّنة."],
    en: ["PDF to JPG", "Convert each page to an image, or extract the embedded images."] }),
  def({ id: "pdf-to-word", group: "from-pdf", runtime: "server", credits: 2, phase: 4,
    ar: ["PDF إلى Word", "ملف DOCX قابل للتحرير بنص عربي سليم الاتجاه."],
    en: ["PDF to Word", "An editable DOCX with Arabic text in the correct order."] }),
  def({ id: "pdf-to-powerpoint", group: "from-pdf", runtime: "server", credits: 2, phase: 4,
    ar: ["PDF إلى PowerPoint", "حوّل الصفحات إلى شرائح قابلة للتعديل."],
    en: ["PDF to PowerPoint", "Turn pages into editable slides."] }),
  def({ id: "pdf-to-excel", group: "from-pdf", runtime: "server", credits: 2, phase: 4,
    ar: ["PDF إلى Excel", "استخرج الجداول إلى أوراق عمل."],
    en: ["PDF to Excel", "Extract tables into spreadsheets."] }),
  def({ id: "pdf-to-pdfa", group: "from-pdf", runtime: "server", phase: 3,
    ar: ["PDF إلى PDF/A", "نسخة معيارية للأرشفة طويلة الأمد."],
    en: ["PDF to PDF/A", "A standards-compliant copy for long-term archiving."] }),

  // Edit and protect PDF
  def({ id: "rotate-pdf", group: "edit", runtime: "browser", maxFiles: 20, phase: 1,
    ar: ["تدوير PDF", "دوّر صفحة واحدة أو الملف كله."],
    en: ["Rotate PDF", "Rotate a single page or the whole file."] }),
  def({ id: "add-page-numbers", group: "edit", runtime: "browser", phase: 1,
    ar: ["ترقيم الصفحات", "بأرقام ١٢٣ أو 123 وفي الموضع الذي تختاره."],
    en: ["Add page numbers", "Arabic-Indic (١٢٣) or Western (123) digits, wherever you want them."] }),
  def({ id: "add-watermark", group: "edit", runtime: "browser", maxFiles: 20, phase: 1,
    ar: ["علامة مائية", "ضع نصًا أو صورة فوق الصفحات."],
    en: ["Add watermark", "Stamp text or an image over the pages."] }),
  def({ id: "crop-pdf", group: "edit", runtime: "browser", phase: 1,
    ar: ["قص PDF", "اقتطع هوامش الصفحات أو جزءًا منها."],
    en: ["Crop PDF", "Trim page margins or crop to a region."] }),
  def({ id: "edit-pdf", group: "edit", runtime: "browser", phase: 1,
    ar: ["تحرير PDF", "أضف نصوصًا وصورًا وأشكالًا."],
    en: ["Edit PDF", "Add text, images and shapes."] }),
  def({ id: "sign-pdf", group: "edit", runtime: "browser", phase: 1,
    ar: ["توقيع PDF", "ارسم توقيعك أو اكتبه أو ارفع صورته."],
    en: ["Sign PDF", "Draw, type or upload your signature."] }),
  def({ id: "unlock-pdf", group: "edit", runtime: "browser", maxFiles: 20, phase: 1,
    ar: ["فتح قفل PDF", "أزل كلمة المرور من ملف تملك صلاحيته."],
    en: ["Unlock PDF", "Remove the password from a PDF you're allowed to open."] }),
  def({ id: "protect-pdf", group: "edit", runtime: "browser", maxFiles: 20, phase: 1,
    ar: ["حماية PDF", "أضف كلمة مرور لمنع الفتح أو التعديل."],
    en: ["Protect PDF", "Add a password to prevent opening or editing."] }),
  def({ id: "redact-pdf", group: "edit", runtime: "server", phase: 3,
    ar: ["تنقيح PDF", "احذف النصوص والمعلومات الحساسة نهائيًا."],
    en: ["Redact PDF", "Permanently remove sensitive text and information."] }),
  def({ id: "compare-pdf", group: "edit", runtime: "browser", maxFiles: 2, phase: 1,
    ar: ["مقارنة PDF", "اعرض الفروق بين نسختين جنبًا إلى جنب."],
    en: ["Compare PDF", "See the differences between two versions side by side."] }),

  // Images
  def({ id: "compress-image", group: "image", runtime: "browser", accepts: IMAGES, maxFiles: 50, phase: 2,
    ar: ["ضغط الصور", "JPG وPNG وWebP بأصغر حجم ممكن."],
    en: ["Compress images", "JPG, PNG and WebP at the smallest size possible."] }),
  def({ id: "resize-image", group: "image", runtime: "browser", accepts: IMAGES, maxFiles: 50, phase: 2,
    ar: ["تغيير الحجم", "بالبكسل أو بالنسبة المئوية لعدة صور معًا."],
    en: ["Resize images", "By pixels or percentage, for many images at once."] }),
  def({ id: "crop-image", group: "image", runtime: "browser", accepts: IMAGES, phase: 2,
    ar: ["قص الصور", "بنسب جاهزة أو بتحديد حر."],
    en: ["Crop image", "Use preset ratios or a free selection."] }),
  def({ id: "convert-to-jpg", group: "image", runtime: "browser", accepts: IMAGES, maxFiles: 50, phase: 2,
    ar: ["تحويل إلى JPG", "من PNG وWebP وHEIC وغيرها."],
    en: ["Convert to JPG", "From PNG, WebP, HEIC and more."] }),
  def({ id: "convert-from-jpg", group: "image", runtime: "browser", accepts: ["image/jpeg"], maxFiles: 50, phase: 2,
    ar: ["تحويل من JPG", "إلى PNG أو WebP أو GIF."],
    en: ["Convert from JPG", "To PNG, WebP or GIF."] }),
  def({ id: "photo-editor", group: "image", runtime: "browser", accepts: IMAGES, phase: 2,
    ar: ["محرر الصور", "فلاتر ونصوص وملصقات وإطارات."],
    en: ["Photo editor", "Filters, text, stickers and frames."] }),
  def({ id: "watermark-image", group: "image", runtime: "browser", accepts: IMAGES, maxFiles: 50, phase: 2,
    ar: ["علامة مائية للصور", "احمِ صورك بنص أو شعار."],
    en: ["Watermark image", "Protect your images with text or a logo."] }),
  def({ id: "meme-generator", group: "image", runtime: "browser", accepts: IMAGES, phase: 2,
    ar: ["صانع الميمز", "قوالب جاهزة وخطوط عربية."],
    en: ["Meme generator", "Ready-made templates and Arabic fonts."] }),
  def({ id: "rotate-image", group: "image", runtime: "browser", accepts: IMAGES, maxFiles: 50, phase: 2,
    ar: ["تدوير الصور", "دوّر عدة صور أو اقلبها معًا."],
    en: ["Rotate image", "Rotate or flip many images at once."] }),
  def({ id: "html-to-image", group: "image", runtime: "server", accepts: ["text/html"], phase: 3,
    ar: ["HTML إلى صورة", "التقط صفحة ويب كاملة بصيغة PNG."],
    en: ["HTML to image", "Capture a full web page as a PNG."] }),

  // AI
  def({ id: "remove-background", group: "ai", runtime: "server", accepts: IMAGES, maxFiles: 10, credits: 3, phase: 5,
    ar: ["إزالة الخلفية", "افصل الشخص أو المنتج عن الخلفية بدقة."],
    en: ["Remove background", "Cut a person or product out of the background cleanly."] }),
  def({ id: "upscale-image", group: "ai", runtime: "browser", accepts: IMAGES, maxFiles: 10, credits: 3, phase: 5,
    ar: ["تكبير الصور", "ضاعف دقة الصورة حتى أربع مرات."],
    en: ["Upscale image", "Increase image resolution up to 4×."] }),
  def({ id: "blur-faces", group: "ai", runtime: "browser", accepts: IMAGES, maxFiles: 20, phase: 2,
    ar: ["تمويه الوجوه", "اكتشف الوجوه وموّهها تلقائيًا."],
    en: ["Blur faces", "Detect faces and blur them automatically."] }),
  def({ id: "summarize-pdf", group: "ai", runtime: "server", credits: 5, phase: 5,
    ar: ["تلخيص PDF", "ملخص عربي لأهم ما في المستند."],
    en: ["Summarize PDF", "A summary of the key points in a document."] }),
  def({ id: "translate-pdf", group: "ai", runtime: "server", credits: 5, phase: 5,
    ar: ["ترجمة PDF", "ترجمة بين العربية والإنجليزية مع الحفاظ على التنسيق."],
    en: ["Translate PDF", "Translate between Arabic and English while keeping the layout."] }),

  // Arabic tools
  def({ id: "fix-arabic-text", group: "arabic", runtime: "server", accepts: [...PDF, "text/plain", ...OFFICE_WORD], phase: 4,
    ar: ["إصلاح النص العربي", "يعالج الحروف المقطّعة والكلمات المعكوسة بعد تحويل PDF إلى Word."],
    en: ["Fix Arabic text", "Repairs broken letters and reversed words after converting PDF to Word."] }),
  def({ id: "hijri-date-stamp", group: "arabic", runtime: "browser", maxFiles: 20, phase: 1,
    ar: ["ختم التاريخ الهجري", "أضف التاريخ الهجري بتقويم أم القرى مع الميلادي إلى صفحاتك."],
    en: ["Hijri date stamp", "Stamp pages with the Hijri (Umm al-Qura) and Gregorian dates."] }),
  def({ id: "arabic-fonts", group: "arabic", runtime: "browser", input: "text", accepts: ["text/plain"], phase: 1,
    ar: ["خطوط عربية", "اكتب نصًا، اختر خط نسخ أو كوفي أو رقعة، ونزّله PDF أو صورة PNG."],
    en: ["Arabic fonts", "Type text, pick a Naskh, Kufi or Ruqaa font, and download it as PDF or PNG."] }),
];
