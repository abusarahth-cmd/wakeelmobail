/**
 * معالج قراءة إكسل منصة نور الذكي (Noor Excel Parser)
 * يدعم صيغ (.xlsx / .xls / .csv)
 * يتجاوز ترويسات التقارير تلقائياً ويستخرج أسماء الطلاب وأرقام الهويات
 * ويستخرج الفصول والشعب بدقة ويوزع الطلاب على فصولهم الحقيقية (فصل 1، فصل 2، ...)
 */
(function() {
    // 1. تضمين وتأمين مكتبة XLSX محلياً ومتوافقاً مع Electron
    function resolveXLSX() {
        if (typeof window !== 'undefined' && window.XLSX && typeof window.XLSX.read === 'function') {
            return window.XLSX;
        }
        if (typeof globalThis !== 'undefined' && globalThis.XLSX && typeof globalThis.XLSX.read === 'function') {
            return globalThis.XLSX;
        }
        if (typeof require === 'function') {
            try {
                const x = require('xlsx');
                if (x && typeof x.read === 'function') return x;
            } catch (err1) {}
            try {
                const path = require('path');
                const p = typeof __dirname !== 'undefined' ? path.join(__dirname, '..', 'vendor', 'xlsx.full.min.js') : 'assets/vendor/xlsx.full.min.js';
                const x2 = require(p);
                if (x2 && typeof x2.read === 'function') return x2;
            } catch (err2) {}
            try {
                const x3 = require('./assets/vendor/xlsx.full.min.js');
                if (x3 && typeof x3.read === 'function') return x3;
            } catch (err3) {}
        }
        return null;
    }

    const _XLSX = resolveXLSX();
    if (_XLSX) {
        window.XLSX = _XLSX;
        if (typeof globalThis !== 'undefined') globalThis.XLSX = _XLSX;
        console.log("✅ [Noor Parser] تم ربط مكتبة XLSX بنجاح الإصدار:", _XLSX.version || "جاهز");
    }

    // تنقية النصوص والأحرف العربية
    function cleanNormText(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .trim()
            .toLowerCase()
            .replace(/[\u064B-\u0652]/g, '') // إزالة التشكيل
            .replace(/ـ/g, '') // إزالة التطويل
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[\/\-_:\\().]/g, ' ')
            .replace(/\s+/g, ' ');
    }

    // تحويل الأرقام العربية الهندية (٠١٢٣٤٥٦٧٨٩) إلى أرقام إنجليزية (0123456789)
    function convertArabicDigits(str) {
        if (!str) return '';
        return String(str)
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    }

    // استخراج رقم الفصل / الشعبة المجرد بدقة
    function parseCleanSectionNumber(val, fallbackVal = null) {
        if (val === undefined || val === null || val === '') {
            return fallbackVal !== null ? String(fallbackVal) : '1';
        }
        
        let str = convertArabicDigits(String(val)).trim();
        if (!str) return fallbackVal !== null ? String(fallbackVal) : '1';

        // 1. فحص وجود شرطة مائلة أو فاصلة مثل "ثاني/3" أو "2/3" أو "3-1"
        const slashMatch = str.match(/[/\\-]\s*([0-9]+|[أ-ي])/);
        if (slashMatch) {
            const part = slashMatch[1];
            if (/^\d+$/.test(part)) {
                const n = parseInt(part, 10);
                if (n > 0 && n <= 30) return String(n);
            }
        }

        // 2. فحص نمط كلمة "فصل 2" أو "شعبة 3" أو "فصل (2)" أو "شعبة: 4"
        const keywordMatch = str.match(/(?:فصل|شعب[ةه]|القسم|قسم)\s*[:/\\-]?\s*\(?\s*([0-9]+|[أ-ي])\s*\)?/i);
        if (keywordMatch) {
            const part = keywordMatch[1];
            if (/^\d+$/.test(part)) {
                const n = parseInt(part, 10);
                if (n > 0 && n <= 30) return String(n);
            }
        }

        // 3. فحص إذا كانت الخلية رقماً مباشراً مثل "2" أو "02" أو "(2)"
        const pureMatch = str.match(/^\s*\(?\s*(\d+)\s*\)?\.?\s*$/);
        if (pureMatch) {
            const n = parseInt(pureMatch[1], 10);
            if (n > 0 && n <= 30) return String(n);
        }

        // 4. مطابقة الحروف الأبجدية كفصول (أ = 1، ب = 2، ج = 3، د = 4، هـ = 5)
        const letterNorm = cleanNormText(str);
        if (letterNorm === 'ا' || letterNorm === 'أ' || letterNorm === 'اول' || letterNorm === 'الاول') return '1';
        if (letterNorm === 'ب' || letterNorm === 'ثاني' || letterNorm === 'الثاني') return '2';
        if (letterNorm === 'ج' || letterNorm === 'ثالث' || letterNorm === 'الثالث') return '3';
        if (letterNorm === 'د' || letterNorm === 'رابع' || letterNorm === 'الرابع') return '4';
        if (letterNorm === 'ه' || letterNorm === 'هـ' || letterNorm === 'خامس' || letterNorm === 'الخامس') return '5';

        // استخراج أي أرقام متبقية داخل النص
        const digitsOnly = str.replace(/[^\d]/g, '');
        if (digitsOnly && digitsOnly.length <= 2) {
            const n = parseInt(digitsOnly, 10);
            if (n > 0 && n <= 30) return String(n);
        }

        return fallbackVal !== null ? String(fallbackVal) : '1';
    }

    // تنميط اسم الصف الدراسي للمراحل التعليمية الثلاث
    function normalizeSaudiGrade(gradeRaw, stageDefault = 'intermediate') {
        if (!gradeRaw) return '';
        let str = String(gradeRaw).trim();
        // إزالة السنوات الميلادية والهجرية لمنع الالتباس (مثال 1447-1448)
        str = str.replace(/14\d\d/g, '').replace(/20\d\d/g, '').replace(/هـ/g, '').replace(/مـ/g, '');
        const s = cleanNormText(str);

        if (!s || s === 'عام' || s === 'الكل' || s === '-' || s === 'undefined' || s === 'null') {
            return '';
        }

        // المرحلة المتوسطة
        if (s.includes('متوسط') || s.includes('المتوسط') || s.includes('/م')) {
            if (s.includes('ثالث') || s.includes('3')) return 'الصف الثالث المتوسط';
            if (s.includes('ثاني') || s.includes('2')) return 'الصف الثاني المتوسط';
            if (s.includes('اول') || s.includes('أول') || s.includes('1')) return 'الصف الأول المتوسط';
            return 'الصف الأول المتوسط';
        }

        // المرحلة الثانوية
        if (s.includes('ثانوي') || s.includes('الثانوي') || s.includes('مسارات') || s.includes('/ث')) {
            if (s.includes('ثالث') || s.includes('3')) return 'الصف الثالث الثانوي';
            if (s.includes('ثاني') || s.includes('2')) return 'الصف الثاني الثانوي';
            if (s.includes('اول') || s.includes('أول') || s.includes('1')) return 'الصف الأول الثانوي';
            return 'الصف الأول الثانوي';
        }

        // المرحلة الابتدائية
        if (s.includes('ابتدائي') || s.includes('الابتدائي')) {
            if (s.includes('سادس') || s.includes('6')) return 'الصف السادس الابتدائي';
            if (s.includes('خامس') || s.includes('5')) return 'الصف الخامس الابتدائي';
            if (s.includes('رابع') || s.includes('4')) return 'الصف الرابع الابتدائي';
            if (s.includes('ثالث') || s.includes('3')) return 'الصف الثالث الابتدائي';
            if (s.includes('ثاني') || s.includes('2')) return 'الصف الثاني الابتدائي';
            if (s.includes('اول') || s.includes('أول') || s.includes('1')) return 'الصف الأول الابتدائي';
            return 'الصف الأول الابتدائي';
        }

        // عام بحسب الرقم
        if (s.includes('سادس') || s === '6') return 'الصف السادس الابتدائي';
        if (s.includes('خامس') || s === '5') return 'الصف الخامس الابتدائي';
        if (s.includes('رابع') || s === '4') return 'الصف الرابع الابتدائي';
        if (s.includes('ثالث') || s === '3') {
            return stageDefault === 'primary' ? 'الصف الثالث الابتدائي' : (stageDefault === 'secondary' ? 'الصف الثالث الثانوي' : 'الصف الثالث المتوسط');
        }
        if (s.includes('ثاني') || s === '2') {
            return stageDefault === 'primary' ? 'الصف الثاني الابتدائي' : (stageDefault === 'secondary' ? 'الصف الثاني الثانوي' : 'الصف الثاني المتوسط');
        }
        if (s.includes('اول') || s.includes('أول') || s === '1') {
            return stageDefault === 'primary' ? 'الصف الأول الابتدائي' : (stageDefault === 'secondary' ? 'الصف الأول الثانوي' : 'الصف الأول المتوسط');
        }

        if (str.startsWith('الصف ')) return str;
        return str;
    }

    // تنظيف واستخراج رقم الجوال السعودي بمرونة فائقة ودقة متناهية
    function extractCleanSaudiPhone(rawVal) {
        if (rawVal === undefined || rawVal === null) return '';
        let valStr = String(rawVal).trim();
        if (!valStr || valStr === '0' || valStr === '-' || valStr === 'لا يوجد' || valStr.toLowerCase() === 'none' || valStr.toLowerCase() === 'null') {
            return '';
        }

        // تحويل الأرقام الهندية/العربية (٠-٩) إلى أرقام إنجليزية (0-9)
        let digits = convertArabicDigits(valStr).replace(/[^0-9]/g, '');
        if (!digits || digits === '0' || /^0+$/.test(digits)) {
            return '';
        }

        // معالجة المفاتيح الدولية (00966 أو 966 أو +966)
        if (digits.startsWith('00966')) {
            digits = '0' + digits.substring(5);
        } else if (digits.startsWith('966')) {
            digits = '0' + digits.substring(3);
        }

        // إذا كان الرقم 9 أرقام ويبدأ بـ 5 (سقط منه الصفر أثناء تحويل الإكسل للرقم)، نضيف الصفر تلقائياً ليصبح 05xxxxxxxx
        if (digits.length === 9 && digits.startsWith('5')) {
            digits = '0' + digits;
        }

        // معالجة أرقام الهواتف الثابتة ذات 8 أرقام بإضافة الصفر (مثال: 11xxxxxxx -> 011xxxxxxx)
        if (digits.length === 8 && /^[1-7]/.test(digits)) {
            digits = '0' + digits;
        }

        // التحقق من صلاحية وطول الرقم (لا نقبل أرقاماً قصيرة عشوائية أقل من 9 أرقام)
        if (digits.length < 9 || /^0+$/.test(digits)) {
            return '';
        }

        return digits;
    }

    // استخراج اسم ولي الأمر تلقائياً من اسم الطالب رباعياً في حال خلو عمود ولي الأمر بالإكسل
    function extractGuardianFromFullName(fullName) {
        if (!fullName) return '';
        let text = String(fullName).trim();
        let parts = text.split(/\s+/);
        if (parts.length <= 1) return '';

        // استبعاد الاسم الأول للطالب
        parts.shift();

        // استبعاد كلمة "بن" أو "بنت" إذا كانت بعد الاسم الأول مباشرة
        if (parts.length > 0 && (parts[0] === 'بن' || parts[0] === 'بنت' || parts[0] === 'بن/بنت')) {
            parts.shift();
        }

        return parts.join(' ').trim();
    }

    /**
     * الدالة الرئيسية لقراءة وتحليل ملف إكسل نور الشامل
     */
    async function parseNoorExcelFile(file, options = {}) {
        const XLSX_LIB = (window.XLSX && typeof window.XLSX.read === 'function') ? window.XLSX : resolveXLSX();
        if (!XLSX_LIB || typeof XLSX_LIB.read !== 'function') {
            const errMsg = "❌ مكتبة قراءة ملفات الإكسل (XLSX.read) غير مهيأة أو غير متوفرة. يرجى التأكد من تحميل المكتبة.";
            console.error(errMsg);
            throw new Error(errMsg);
        }

        console.group("📥 [معالج إكسل نور الذكي] بدء قراءة وفحص ملف البيانات");
        console.log("📄 اسم الملف:", file.name);
        console.log("📊 الحجم:", (file.size / 1024).toFixed(1) + " كيلوبايت");

        const buffer = await file.arrayBuffer();
        let workbook = null;
        const readErrors = [];

        // الاستراتيجية 1: ArrayBuffer (لصيغ XLSX الحديثة)
        try {
            const data = new Uint8Array(buffer);
            workbook = XLSX_LIB.read(data, { type: 'array', cellDates: true, codepage: 1256 });
            console.log("✅ نجحت القراءة عبر استراتيجية ArrayBuffer");
        } catch (err1) {
            readErrors.push("ArrayBuffer: " + err1.message);
        }

        // الاستراتيجية 2: BinaryString (لصيغ XLS القديمة)
        if (!workbook) {
            try {
                let binary = "";
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                workbook = XLSX_LIB.read(binary, { type: 'binary', cellDates: true, codepage: 1256 });
                console.log("✅ نجحت القراءة عبر استراتيجية BinaryString");
            } catch (err2) {
                readErrors.push("BinaryString: " + err2.message);
            }
        }

        // الاستراتيجية 3: فك تشفير النصوص (لصيغ CSV وترميز Windows-1256 العربي)
        if (!workbook) {
            try {
                let textContent = '';
                try {
                    textContent = new TextDecoder('windows-1256').decode(buffer);
                } catch (eDec) {
                    textContent = new TextDecoder('utf-8').decode(buffer);
                }
                workbook = XLSX_LIB.read(textContent, { type: 'string', cellDates: true });
                console.log("✅ نجحت القراءة عبر استراتيجية Decoded Text");
            } catch (err3) {
                readErrors.push("TextDecoder: " + err3.message);
            }
        }

        if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
            const detailed = readErrors.join(" | ");
            console.error("❌ فشلت كافة استراتيجيات قراءة الملف:", detailed);
            console.groupEnd();
            throw new Error("تعذر قراءة ملف الإكسل بكافة الطرق المتاحة. سبب الخطأ: " + detailed);
        }

        console.log("📑 أوراق العمل المكتشفة في الملف (" + workbook.SheetNames.length + "):", workbook.SheetNames);

        const extractedStudents = [];
        const stageDefault = (window.appState && window.appState.settings && window.appState.settings.stage) || 'intermediate';

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet || !sheet['!ref']) continue;

            const rawRows = XLSX_LIB.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (!rawRows || !rawRows.length) continue;

            // 1. فحص بيانات الترويسة العلوية للورقة (الأسطر 0 إلى 22) لاستخراج الصف والفصل المحدد للورقة
            let sheetLevelGrade = '';
            let sheetLevelSection = null;

            for (let r = 0; r < Math.min(rawRows.length, 22); r++) {
                const row = rawRows[r] || [];
                for (let c = 0; c < row.length; c++) {
                    const cellVal = String(row[c] || '').trim();
                    
                    // استكشاف الصف الدراسي
                    if (cellVal === 'الصف' || cellVal === 'الصف الدراسي') {
                        for (let k = 0; k < row.length; k++) {
                            const candidate = String(row[k] || '').trim();
                            if (candidate.includes('المتوسط') || candidate.includes('الابتدائي') || candidate.includes('الثانوي') || 
                                candidate.includes('أول') || candidate.includes('ثاني') || candidate.includes('ثالث') || 
                                candidate.includes('رابع') || candidate.includes('خامس') || candidate.includes('سادس')) {
                                sheetLevelGrade = candidate;
                                break;
                            }
                        }
                    }

                    // استكشاف الفصل أو الشعبة في الترويسة العلوية
                    if (cellVal === 'الفصل' || cellVal === 'الشعبة' || cellVal === 'رقم الفصل') {
                        for (let k = 0; k < row.length; k++) {
                            const candidate = convertArabicDigits(String(row[k] || '')).trim();
                            if (/^[1-9]\d*$/.test(candidate) && parseInt(candidate, 10) <= 30) {
                                sheetLevelSection = parseInt(candidate, 10);
                                break;
                            }
                        }
                    }
                }
            }

            // إذا لم يتم العثور على الفصل في الترويسة، نفحص اسم الورقة نفسها مثل (فصل 2 أو 2)
            if (sheetLevelSection === null) {
                const sheetSecMatch = convertArabicDigits(sheetName).match(/(?:فصل|شعب[ةه]|صف)?\s*(\d+)/i);
                if (sheetSecMatch && parseInt(sheetSecMatch[1], 10) <= 30) {
                    sheetLevelSection = parseInt(sheetSecMatch[1], 10);
                }
            }

            // 2. اكتشاف صف عناوين الأعمدة الحقيقي (تجاوز ترويسات الوزارة والمدرسة)
            let tableHeaderRowIdx = -1;
            let maxScore = -1;

            for (let r = 0; r < Math.min(rawRows.length, 35); r++) {
                const row = rawRows[r] || [];
                if (!Array.isArray(row) || row.length === 0) continue;

                let score = 0;
                row.forEach(cell => {
                    const s = cleanNormText(cell);
                    if (s.includes('اسم الطالب') || s === 'الاسم الاول' || s === 'اسم التلميذ') score += 20;
                    else if (s === 'اسم' || s === 'الاسم' || s.includes('طالب')) score += 10;
                    
                    if (s.includes('هوي') || s.includes('سجل') || s.includes('اقام') || s.includes('إقام') || s === 'identification') score += 15;
                    if (s.includes('فصل') || s.includes('شعب') || s === 'section') score += 10;
                    if (s.includes('صف') || s.includes('الصف') || s === 'class' || s === 'grade') score += 8;
                    if (s.includes('جوال') || s.includes('هاتف') || s.includes('mobile')) score += 6;
                    if (s.includes('الاب') || s.includes('الجد') || s.includes('العائل')) score += 5;
                });

                if (score > maxScore && score >= 15) {
                    maxScore = score;
                    tableHeaderRowIdx = r;
                }
            }

            if (tableHeaderRowIdx === -1) {
                console.warn(`⚠️ لم يتم العثور على جدول طلاب صالح في ورقة العمل: "${sheetName}"`);
                continue;
            }

            const headerRow = rawRows[tableHeaderRowIdx] || [];
            let nameCol = -1, firstCol = -1, fatherCol = -1, grandCol = -1, familyCol = -1;
            let nationalIdCol = -1, gradeCol = -1, sectionCol = -1;
            let guardianCol = -1, primaryPhoneCol = -1;
            const candidatePhoneCols = [];

            headerRow.forEach((cell, colIdx) => {
                const s = cleanNormText(cell);
                if (!s) return;

                // 1. اسم الطالب
                if (s.includes('اسم الطالب') || s === 'اسم التلميذ' || s === 'الاسم الكامل' || s === 'اسم الطالب كامل' || s === 'الاسم رباعي' || s === 'اسم الدارس') {
                    nameCol = colIdx;
                } else if (s === 'الاسم' || s === 'اسم' || s === 'اسم الطالبه' || s === 'اسم الطالبة') {
                    if (nameCol === -1) nameCol = colIdx;
                }

                // أجزاء الاسم المقسم
                if (s === 'الاسم الاول' || s === 'اسم الطالب الاول') firstCol = colIdx;
                if (s === 'اسم الاب' || s === 'اسم والده' || s === 'اسم الوالد' || s === 'الاب' || s === 'والده' || s === 'والد الطالب') fatherCol = colIdx;
                if (s === 'اسم الجد' || s === 'الجد') grandCol = colIdx;
                if (s.includes('العائل') || s.includes('اللقب') || s.includes('القب') || s === 'اسم العائلة' || s === 'القبيلة') familyCol = colIdx;

                // 2. الهوية الوطنية أو الإقامة أو السجل المدني
                if (s.includes('هوي') || s.includes('سجل') || s.includes('اقام') || s.includes('إقام') || s.includes('مدني') || s === 'identification') {
                    nationalIdCol = colIdx;
                }

                // 3. الفصل أو الشعبة
                if (s.includes('فصل') || s.includes('شعب') || s === 'section') {
                    sectionCol = colIdx;
                }

                // 4. الصف الدراسي
                if (s === 'صف' || s === 'الصف' || s === 'الصف الدراسي' || s === 'class' || s === 'grade') {
                    gradeCol = colIdx;
                }

                // 5. اسم ولي الأمر (اسم ولي الأمر، ولي الأمر، اسم الأب، الوصي، رب الأسرة)
                if (
                    s.includes('اسم ولي الامر') || 
                    s.includes('اسم ولي امر') || 
                    s.includes('ولي الامر') || 
                    s.includes('ولي امر') || 
                    s.includes('الوصي') || 
                    s.includes('رب الاسره') || 
                    s.includes('رب الاسرة') || 
                    s.includes('ولي الطالب') ||
                    s.includes('ولي التلميذ') ||
                    s.includes('القائم بالرعايه') ||
                    s.includes('القائم بالرعاية') ||
                    s === 'guardian'
                ) {
                    guardianCol = colIdx;
                }

                // 6. أرقام الهواتف والجوالات (جوال ولي الأمر، رقم الجوال، الهاتف الجوال، الجوال، هاتف المنزل، رقم الهاتف، جوال الأب)
                if (
                    s.includes('جوال') || 
                    s.includes('هاتف') || 
                    s.includes('mobile') || 
                    s.includes('phone') || 
                    s.includes('tel')
                ) {
                    if (s.includes('ولي') || s.includes('الاب') || s.includes('والد')) {
                        primaryPhoneCol = colIdx;
                    } else if (primaryPhoneCol === -1 && (s.includes('جوال') || s.includes('mobile'))) {
                        primaryPhoneCol = colIdx;
                    }
                    candidatePhoneCols.push(colIdx);
                }
            });

            // 3. قراءة أسطر الطلاب واستخراج الحقول بدقة وتوزيع الفصول
            let sheetStudentCount = 0;
            for (let r = tableHeaderRowIdx + 1; r < rawRows.length; r++) {
                const row = rawRows[r] || [];
                
                // استخراج الاسم الكامل (سواء كان في عمود واحد أو مقسم على 4 أعمدة)
                let fullName = '';
                if (nameCol !== -1 && row[nameCol]) {
                    fullName = String(row[nameCol]).trim();
                } else if (firstCol !== -1 && row[firstCol]) {
                    const parts = [
                        row[firstCol],
                        fatherCol !== -1 ? row[fatherCol] : '',
                        grandCol !== -1 ? row[grandCol] : '',
                        familyCol !== -1 ? row[familyCol] : ''
                    ].filter(Boolean).map(p => String(p).trim());
                    fullName = parts.join(' ');
                }

                // تخطي الأسطر الفارغة أو أسطر الإجماليات والتواقيع
                if (!fullName || fullName.length < 3 || fullName.includes('المجموع') || fullName.includes('إجمالي') || fullName.includes('العدد')) {
                    continue;
                }

                // تنظيف الهوية الوطنية
                let nationalId = '';
                if (nationalIdCol !== -1 && row[nationalIdCol] !== undefined) {
                    nationalId = convertArabicDigits(String(row[nationalIdCol])).replace(/[^0-9]/g, '');
                }

                // استخراج الصف
                let rowGradeRaw = (gradeCol !== -1 && row[gradeCol]) ? String(row[gradeCol]).trim() : '';
                let finalGrade = normalizeSaudiGrade(rowGradeRaw || sheetLevelGrade, stageDefault);

                // استخراج الفصل الحقيقي وتجريده بدقة
                let rowSectionRaw = (sectionCol !== -1 && row[sectionCol] !== undefined) ? String(row[sectionCol]).trim() : '';
                let finalClassNum = '1';

                // إذا وجدنا في ترويسة الورقة أن الورقة مخصصة لفصل محدد (مثل فصل 2، فصل 3)
                // وكان سطر الطالب فارغاً أو يحتوي على 1 مكرر من نموذج ثابت، نعتمد فصل الورقة!
                if (sheetLevelSection !== null && sheetLevelSection > 0) {
                    if (!rowSectionRaw || rowSectionRaw === '1' || rowSectionRaw === String(sheetLevelSection)) {
                        finalClassNum = String(sheetLevelSection);
                    } else {
                        finalClassNum = parseCleanSectionNumber(rowSectionRaw, sheetLevelSection);
                    }
                } else {
                    finalClassNum = parseCleanSectionNumber(rowSectionRaw, '1');
                }

                // استخراج رقم الجوال بمرونة وتنظيف وإضافة الصفر إن سقط
                let phone = '';
                if (primaryPhoneCol !== -1 && row[primaryPhoneCol] !== undefined) {
                    phone = extractCleanSaudiPhone(row[primaryPhoneCol]);
                }
                if (!phone && candidatePhoneCols.length > 0) {
                    for (const pCol of candidatePhoneCols) {
                        if (pCol !== primaryPhoneCol && row[pCol] !== undefined) {
                            const cand = extractCleanSaudiPhone(row[pCol]);
                            if (cand) {
                                phone = cand;
                                break;
                            }
                        }
                    }
                }

                // استخراج اسم ولي الأمر بمرونة
                let guardian = '';
                // 1. فحص عمود ولي الأمر المباشر (اسم ولي الأمر، الوصي، رب الأسرة، إلخ)
                if (guardianCol !== -1 && row[guardianCol] !== undefined && row[guardianCol] !== null) {
                    const gVal = String(row[guardianCol]).trim();
                    if (gVal && gVal !== '-' && gVal !== '0' && gVal !== 'لا يوجد' && !/^\d+$/.test(gVal)) {
                        guardian = gVal;
                    }
                }
                // 2. إذا لم نجد ولي أمر في العمود المخصص، نفحص عمود اسم الأب
                if (!guardian && fatherCol !== -1 && row[fatherCol] !== undefined && row[fatherCol] !== null) {
                    const fVal = String(row[fatherCol]).trim();
                    if (fVal && fVal !== '-' && fVal !== '0' && !/^\d+$/.test(fVal)) {
                        let fullFather = fVal;
                        if (grandCol !== -1 && row[grandCol] && !fullFather.includes(String(row[grandCol]).trim())) {
                            fullFather += ' ' + String(row[grandCol]).trim();
                        }
                        if (familyCol !== -1 && row[familyCol] && !fullFather.includes(String(row[familyCol]).trim())) {
                            fullFather += ' ' + String(row[familyCol]).trim();
                        }
                        guardian = fullFather.trim();
                    }
                }
                // 3. كحل أخير تلقائي وذكي: استخراج اسم ولي الأمر من اسم الطالب الكامل
                if (!guardian && fullName) {
                    guardian = extractGuardianFromFullName(fullName);
                }

                // استكشاف المرحلة
                let stage = stageDefault;
                if (finalGrade.includes('ابتدائي')) stage = 'primary';
                else if (finalGrade.includes('متوسط')) stage = 'intermediate';
                else if (finalGrade.includes('ثانوي')) stage = 'secondary';

                extractedStudents.push({
                    name: fullName,
                    nationalId: nationalId,
                    grade: finalGrade,
                    classNum: finalClassNum,
                    phone: phone,
                    guardian: guardian,
                    stage: stage,
                    educationType: 'عام'
                });

                sheetStudentCount++;
            }

            console.log(`📋 الورقة "${sheetName}": تم استخراج ${sheetStudentCount} طالب (الصف: ${sheetLevelGrade || 'تلقائي'} | الفصل: ${sheetLevelSection || 'حسب الأسطر'})`);
        }

        console.log(`🎯 إجمالي الطلاب المستخرجين بنجاح من كافة أوراق الملف: ${extractedStudents.length} طالب`);
        console.groupEnd();

        return extractedStudents;
    }

    window.parseNoorExcelFile = parseNoorExcelFile;
    console.log('✅ [Noor Excel Parser] معالج قراءة إكسل نور الذكي جاهز.');
})();
