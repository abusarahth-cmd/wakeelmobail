/**
 * نظام التخزين عالي السعة المستند إلى IndexedDB
 * WakeelBehaviorDB - High-Capacity Storage Engine
 * يدعم تخزين آلاف السجلات والمستندات الثنائية (Blobs / ArrayBuffer)
 * والصور عالية الدقة وملفات PDF دون قيود الحجم (Quota Exceeded)
 */

(function() {
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function base64ToBlob(base64Data, contentType = '') {
        const parts = base64Data.split(';base64,');
        const rawContentType = parts.length > 1 ? parts[0].replace('data:', '') : contentType;
        const rawBase64 = parts.length > 1 ? parts[1] : parts[0];
        
        const byteCharacters = atob(rawBase64);
        const byteArrays = [];
        const sliceSize = 1024;

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }

        return new Blob(byteArrays, { type: rawContentType || 'application/octet-stream' });
    }

    const WakeelDB = {
        dbName: 'WakeelBehaviorDB',
        version: 2,
        _db: null,
        _activeUrls: new Map(),

        async open() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('records')) {
                        db.createObjectStore('records', { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains('files')) {
                        db.createObjectStore('files', { keyPath: 'id' });
                    }
                };

                request.onsuccess = (event) => {
                    this._db = event.target.result;
                    this._db.onversionchange = () => {
                        this._db.close();
                        this._db = null;
                    };
                    resolve(this._db);
                };

                request.onerror = (event) => {
                    console.error('❌ خطأ في فتح قاعدة بيانات IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        },

        async get(key, defaultValue = null) {
            try {
                const db = await this.open();
                return new Promise((resolve) => {
                    const tx = db.transaction('records', 'readonly');
                    const store = tx.objectStore('records');
                    const req = store.get(key);
                    req.onsuccess = () => {
                        if (req.result && req.result.value !== undefined) {
                            resolve(req.result.value);
                        } else {
                            resolve(defaultValue);
                        }
                    };
                    req.onerror = () => resolve(defaultValue);
                });
            } catch (err) {
                console.warn('WakeelDB.get fallback:', err);
                return defaultValue;
            }
        },

        async set(key, value) {
            try {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('records', 'readwrite');
                    const store = tx.objectStore('records');
                    const req = store.put({
                        key: key,
                        value: value,
                        updatedAt: new Date().toISOString()
                    });
                    req.onsuccess = () => resolve(true);
                    req.onerror = (e) => reject(e.target.error);
                });
            } catch (err) {
                console.error(`❌ خطأ في حفظ العنصر ${key} في IndexedDB:`, err);
                return false;
            }
        },

        async remove(key) {
            try {
                const db = await this.open();
                return new Promise((resolve) => {
                    const tx = db.transaction('records', 'readwrite');
                    const store = tx.objectStore('records');
                    const req = store.delete(key);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (err) {
                return false;
            }
        },

        /**
         * حفظ ملف ثنائي (صورة عالية الدقة، شاهد، ملف PDF) بصيغة Blob ثنائية نقية
         */
        async saveFile(fileBlobOrArrayBuffer, meta = {}) {
            try {
                const db = await this.open();
                const fileId = meta.id || ('file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
                
                let blobData = fileBlobOrArrayBuffer;
                if (fileBlobOrArrayBuffer instanceof ArrayBuffer) {
                    blobData = new Blob([fileBlobOrArrayBuffer], { type: meta.type || 'application/octet-stream' });
                } else if (!(fileBlobOrArrayBuffer instanceof Blob)) {
                    blobData = new Blob([fileBlobOrArrayBuffer], { type: meta.type || 'application/octet-stream' });
                }

                const record = {
                    id: fileId,
                    name: meta.name || 'مستند_مرفق',
                    type: meta.type || blobData.type || 'application/octet-stream',
                    size: blobData.size || 0,
                    data: blobData,
                    category: meta.category || 'evidence', // 'evidence', 'logo', 'qr', 'document'
                    relatedId: meta.relatedId || null, // e.g. violation ID
                    createdAt: new Date().toISOString()
                };

                return new Promise((resolve, reject) => {
                    const tx = db.transaction('files', 'readwrite');
                    const store = tx.objectStore('files');
                    const req = store.put(record);
                    req.onsuccess = () => resolve({ id: fileId, name: record.name, type: record.type, size: record.size });
                    req.onerror = (e) => reject(e.target.error);
                });
            } catch (err) {
                console.error('❌ خطأ في حفظ الملف الثنائي:', err);
                return null;
            }
        },

        async getFile(id) {
            try {
                const db = await this.open();
                return new Promise((resolve) => {
                    const tx = db.transaction('files', 'readonly');
                    const store = tx.objectStore('files');
                    const req = store.get(id);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                });
            } catch (err) {
                return null;
            }
        },

        async deleteFile(id) {
            try {
                const db = await this.open();
                if (this._activeUrls.has(id)) {
                    URL.revokeObjectURL(this._activeUrls.get(id));
                    this._activeUrls.delete(id);
                }
                return new Promise((resolve) => {
                    const tx = db.transaction('files', 'readwrite');
                    const store = tx.objectStore('files');
                    const req = store.delete(id);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (err) {
                return false;
            }
        },

        async getFileBlobUrl(id) {
            if (this._activeUrls.has(id)) {
                return this._activeUrls.get(id);
            }
            const fileObj = await this.getFile(id);
            if (!fileObj || !fileObj.data) return null;
            const url = URL.createObjectURL(fileObj.data);
            this._activeUrls.set(id, url);
            return url;
        },

        async getAllFiles() {
            try {
                const db = await this.open();
                return new Promise((resolve) => {
                    const tx = db.transaction('files', 'readonly');
                    const store = tx.objectStore('files');
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => resolve([]);
                });
            } catch (err) {
                return [];
            }
        },

        /**
         * تصدير نسخة احتياطية شاملة لكامل قاعدة البيانات (السجلات + الملفات الثنائية بصيغة Base64 متوافقة)
         */
        async exportCompleteBackup() {
            const db = await this.open();
            
            const records = await new Promise((res) => {
                const tx = db.transaction('records', 'readonly');
                tx.objectStore('records').getAll().onsuccess = (e) => res(e.target.result || []);
            });

            const rawFiles = await new Promise((res) => {
                const tx = db.transaction('files', 'readonly');
                tx.objectStore('files').getAll().onsuccess = (e) => res(e.target.result || []);
            });

            const encodedFiles = [];
            for (const f of rawFiles) {
                try {
                    let b64 = '';
                    if (f.data instanceof Blob) {
                        b64 = await blobToBase64(f.data);
                    } else if (f.data) {
                        const blob = new Blob([f.data], { type: f.type || 'application/octet-stream' });
                        b64 = await blobToBase64(blob);
                    }
                    encodedFiles.push({
                        id: f.id,
                        name: f.name,
                        type: f.type,
                        size: f.size,
                        category: f.category,
                        relatedId: f.relatedId,
                        createdAt: f.createdAt,
                        dataBase64: b64
                    });
                } catch (e) {
                    console.warn(`تعذر ترميز الملف ${f.name} في النسخة الاحتياطية:`, e);
                }
            }

            return {
                app: 'WakeelStudentBehavior',
                version: '1447.3',
                format: 'INDEXEDDB_FULL_VAULT',
                exportedAt: new Date().toISOString(),
                records: records,
                files: encodedFiles
            };
        },

        /**
         * استعادة كاملة لجميع السجلات والملفات والمرفقات
         */
        async importCompleteBackup(backupData) {
            if (!backupData || !Array.isArray(backupData.records)) {
                throw new Error('ملف النسخة الاحتياطية غير متوافق أو لا يحتوي على بنية بيانات صحيحة.');
            }

            const db = await this.open();
            const tx = db.transaction(['records', 'files'], 'readwrite');
            const recStore = tx.objectStore('records');
            const fileStore = tx.objectStore('files');

            for (const r of backupData.records) {
                if (r && r.key) {
                    recStore.put(r);
                }
            }

            if (Array.isArray(backupData.files)) {
                for (const f of backupData.files) {
                    if (f && f.id && f.dataBase64) {
                        const blob = base64ToBlob(f.dataBase64, f.type);
                        fileStore.put({
                            id: f.id,
                            name: f.name || 'مستند_مستعاد',
                            type: f.type || 'application/octet-stream',
                            size: f.size || blob.size,
                            category: f.category || 'evidence',
                            relatedId: f.relatedId || null,
                            createdAt: f.createdAt || new Date().toISOString(),
                            data: blob
                        });
                    }
                }
            }

            return new Promise((resolve, reject) => {
                tx.oncomplete = () => {
                    console.log('✅ تمت استعادة كامل بيانات IndexedDB بنجاح.');
                    resolve(true);
                };
                tx.onerror = (e) => reject(e.target.error);
            });
        },

        /**
         * ضغط الصور التلقائي عبر HTML5 Canvas لتقليل حجم الصورة إلى أقل من 120KB
         * أقصى عرض/ارتفاع 1000px وجودة JPEG 0.7
         */
        async compressImage(fileOrBlob, maxWidth = 1000, quality = 0.7) {
            if (!fileOrBlob || !fileOrBlob.type || !fileOrBlob.type.startsWith('image/')) {
                return fileOrBlob;
            }
            return new Promise((resolve) => {
                const img = new Image();
                const url = URL.createObjectURL(fileOrBlob);
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxWidth) {
                        if (width > height) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxWidth) / height);
                            height = maxWidth;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob && blob.size < fileOrBlob.size) {
                            resolve(blob);
                        } else {
                            resolve(fileOrBlob);
                        }
                    }, 'image/jpeg', quality);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(fileOrBlob);
                };
                img.src = url;
            });
        },

        /**
         * استعلام إحصائيات مساحة الصور والملفات المخزنة في IndexedDB
         */
        async getFilesStorageStats() {
            try {
                const files = await this.getAllFiles();
                let totalBytes = 0;
                let imageCount = 0;
                for (const f of files) {
                    totalBytes += (f.size || 0);
                    imageCount++;
                }
                const mb = (totalBytes / (1024 * 1024)).toFixed(2);
                const kb = (totalBytes / 1024).toFixed(1);
                const formatted = totalBytes >= (1024 * 1024) ? `${mb} ميجابايت` : `${kb} كيلوبايت`;
                return {
                    count: imageCount,
                    totalBytes: totalBytes,
                    formatted: formatted
                };
            } catch(e) {
                return { count: 0, totalBytes: 0, formatted: '0 كيلوبايت' };
            }
        },

        /**
         * تنظيف الصور القديمة فقط (أقدم من عدد أيام محدد) لتوفير المساحة مع الحفاظ على نصوص وسجلات التقارير
         */
        async cleanOldImages(daysThreshold = 30) {
            try {
                const files = await this.getAllFiles();
                const now = Date.now();
                const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;
                let deletedCount = 0;
                let freedBytes = 0;

                for (const f of files) {
                    if (f.category === 'logo' || f.category === 'signature') continue;
                    const fileDate = f.createdAt ? new Date(f.createdAt).getTime() : 0;
                    if (fileDate && (now - fileDate) > thresholdMs) {
                        freedBytes += (f.size || 0);
                        deletedCount++;
                        await this.deleteFile(f.id);
                    }
                }
                return { deletedCount, freedBytes };
            } catch(e) {
                console.error('Error cleaning old images:', e);
                return { deletedCount: 0, freedBytes: 0 };
            }
        }
    };

    window.WakeelDB = WakeelDB;
    console.log('✅ [IndexedDB Engine] محرك التخزين عالي السعة جاهز ويعمل بكفاءة.');
})();
