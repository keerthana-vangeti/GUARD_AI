/* ============================================================
   OCR Module — Browser-based OCR using Tesseract.js
   Extracts text from images → feeds into detection pipeline.
   ============================================================ */

const OCR = (() => {
    'use strict';

    let isInitialized = false;
    let isProcessing = false;

    /**
     * Process an image file and extract text using Tesseract.js.
     * The extracted text then goes through the same privacy pipeline.
     *
     * @param {File} file - Image file from file input
     * @param {Function} progressCallback - Optional progress callback (0-1)
     * @returns {Promise<{ text: string, confidence: number }>}
     */
    async function processImage(file, progressCallback) {
        if (isProcessing) {
            throw new Error('OCR is already processing an image. Please wait.');
        }

        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Invalid file type. Please upload an image file (JPEG, PNG, BMP, TIFF).');
        }

        // Max file size: 10MB
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('Image file is too large. Maximum size is 10MB.');
        }

        isProcessing = true;

        try {
            // Dynamically load Tesseract.js from CDN
            if (!window.Tesseract) {
                if (progressCallback) progressCallback(0.05);

                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('Failed to load OCR library. Check your internet connection.'));
                    document.head.appendChild(script);
                });
            }

            if (progressCallback) progressCallback(0.1);

            // Create a worker and process
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (progressCallback && m.progress) {
                        progressCallback(0.1 + m.progress * 0.85);
                    }
                }
            });

            const { data } = await worker.recognize(file);

            await worker.terminate();

            if (progressCallback) progressCallback(1.0);

            isProcessing = false;

            if (!data.text || data.text.trim().length === 0) {
                throw new Error('No text could be extracted from the image. The image may be blank, blurry, or contain non-text content.');
            }

            return {
                text: data.text.trim(),
                confidence: data.confidence / 100 // Normalize to 0-1
            };
        } catch (err) {
            isProcessing = false;
            throw err;
        }
    }

    /**
     * Check if OCR is currently processing.
     * @returns {boolean}
     */
    function isBusy() {
        return isProcessing;
    }

    return { processImage, isBusy };
})();
