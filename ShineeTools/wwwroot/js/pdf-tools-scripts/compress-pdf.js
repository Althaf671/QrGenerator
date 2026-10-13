(() => {
    "use strict";

    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    const PDF_MIME_TYPE = "application/pdf";
    const DEFAULT_OUTPUT_NAME = "compressed-document";

    const COMPRESSION_SETTINGS = {
        light: {
            name: "Ringan",
            rasterize: false,
            quality: 0.90,
            scale: 1.75
        },
        recommended: {
            name: "Direkomendasikan",
            rasterize: true,
            quality: 0.76,
            scale: 1.35
        },
        maximum: {
            name: "Maksimum",
            rasterize: true,
            quality: 0.55,
            scale: 1.0
        }
    };

    const $ = (id) => document.getElementById(id);

    const form = $("compressPdfForm");
    const fileInput = $("pdfFile");
    const statusElement = $("pdfStatus");

    const infoSection = $("pdfInfoSection");
    const fileNameElement = $("pdfFileName");
    const pageCountElement = $("pdfPageCount");
    const fileSizeElement = $("pdfFileSize");

    const outputFilenameInput = $("outputFilename");
    const compressButton = $("compressPdf");
    const resetButton = $("resetCompress");

    const resultActions = $("pdfResultActions");
    const downloadButton = $("downloadPdf");

    const originalSizeElement = $("summaryOriginalSize");
    const compressedSizeElement = $("summaryCompressedSize");
    const reductionElement = $("summaryReduction");
    const readyStatusElement = $("summaryReadyStatus");

    if (
        !form ||
        !fileInput ||
        !statusElement ||
        !infoSection ||
        !fileNameElement ||
        !pageCountElement ||
        !fileSizeElement ||
        !outputFilenameInput ||
        !compressButton ||
        !resetButton ||
        !resultActions ||
        !downloadButton ||
        !originalSizeElement ||
        !compressedSizeElement ||
        !reductionElement ||
        !readyStatusElement
    ) {
        console.error("[Compress PDF] Required DOM elements are missing.");
        return;
    }

    let selectedFile = null;
    let selectedPdfBytes = null;
    let selectedPageCount = 0;

    let outputBlob = null;
    let outputUrl = null;

    let previewDocument = null;
    let previewLoadingTask = null;
    let activeRenderTask = null;

    let currentPage = 1;
    let previewScale = 1;

    let isProcessing = false;
    let selectionVersion = 0;
    let previewVersion = 0;

    function getPdfLib() {
        if (!window.PDFLib) {
            throw new Error(
                "Library PDF gagal dimuat. Periksa koneksi internet."
            );
        }

        return window.PDFLib;
    }

    function getPdfJs() {
        if (!window.pdfjsLib) {
            throw new Error(
                "Library preview PDF gagal dimuat. Muat ulang halaman."
            );
        }

        return window.pdfjsLib;
    }

    function refreshIcons() {
        window.lucide?.createIcons();
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) {
            return "-";
        }

        if (bytes === 0) {
            return "0 B";
        }

        const units = ["B", "KB", "MB", "GB"];
        const index = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1
        );

        return `${(bytes / 1024 ** index).toLocaleString("id-ID", {
            maximumFractionDigits: index === 0 ? 0 : 2
        })} ${units[index]}`;
    }

    function getOutputFilename() {
        let name = outputFilenameInput.value.trim();

        name = name
            .replace(/\.pdf$/i, "")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
            .replace(/[. ]+$/g, "")
            .trim();

        return `${name || DEFAULT_OUTPUT_NAME}.pdf`;
    }

    function getSelectedCompressionLevel() {
        const input = form.querySelector(
            'input[name="compressionLevel"]:checked'
        );

        return input && COMPRESSION_SETTINGS[input.value]
            ? input.value
            : "light";
    }

    function setStatus(message, type = "info") {
        statusElement.textContent = message;
        statusElement.className =
            `alert alert-${type} mt-3 mb-0`;
        statusElement.classList.remove("d-none");
    }

    function clearStatus() {
        statusElement.textContent = "";
        statusElement.className = "alert d-none mt-3 mb-0";
    }

    function setReadyStatus(message) {
        readyStatusElement.textContent = message;
    }

    function updateResultSummary(originalSize, compressedSize) {
        originalSizeElement.textContent = formatBytes(originalSize);
        compressedSizeElement.textContent = formatBytes(compressedSize);

        const difference = originalSize - compressedSize;
        const percentage = originalSize > 0
            ? (difference / originalSize) * 100
            : 0;

        reductionElement.textContent =
            `${percentage.toLocaleString("id-ID", {
                maximumFractionDigits: 2
            })}% (${difference >= 0 ? "hemat" : "bertambah"} ${formatBytes(
                Math.abs(difference)
            )})`;
    }

    function setProcessing(processing) {
        isProcessing = processing;

        compressButton.disabled =
            processing || !selectedFile || !selectedPdfBytes;

        resetButton.disabled = processing;
        fileInput.disabled = processing;
        outputFilenameInput.disabled = processing;

        form.querySelectorAll(
            'input[name="compressionLevel"]'
        ).forEach((input) => {
            input.disabled = processing;
        });

        compressButton.innerHTML = processing
            ? `
                <span class="spinner-border spinner-border-sm me-2"
                      aria-hidden="true"></span>
                Memproses PDF...
            `
            : `
                <i data-lucide="file-down"
                   class="me-1"
                   style="width: 18px; height: 18px;"></i>
                Kompres PDF
            `;

        refreshIcons();
    }

    function normalizePdfBytes(bytes) {
        const marker = [0x25, 0x50, 0x44, 0x46, 0x2D];
        const limit = Math.min(bytes.length - marker.length, 1024);

        for (let i = 0; i <= limit; i++) {
            if (marker.every((byte, index) => bytes[i + index] === byte)) {
                return bytes.slice(i);
            }
        }

        throw new Error("File tidak memiliki struktur PDF yang valid.");
    }

    function validateFile(file) {
        if (!file) {
            throw new Error("Pilih file PDF terlebih dahulu.");
        }

        if (
            !file.name.toLowerCase().endsWith(".pdf") &&
            file.type !== PDF_MIME_TYPE
        ) {
            throw new Error("File yang dipilih harus berformat PDF.");
        }

        if (file.size <= 0) {
            throw new Error("File PDF kosong.");
        }

        if (file.size > MAX_FILE_SIZE) {
            throw new Error("Ukuran file melebihi batas maksimal 25 MB.");
        }
    }

    function removePreview() {
        previewVersion++;

        if (activeRenderTask) {
            try {
                activeRenderTask.cancel();
            } catch {
                // Render mungkin sudah selesai.
            }

            activeRenderTask = null;
        }

        if (previewLoadingTask) {
            try {
                previewLoadingTask.destroy();
            } catch {
                // Loading task mungkin sudah selesai.
            }

            previewLoadingTask = null;
        }

        if (previewDocument) {
            try {
                previewDocument.destroy();
            } catch {
                // Dokumen mungkin sudah dihancurkan.
            }

            previewDocument = null;
        }

        $("pdfPreviewSection")?.remove();

        currentPage = 1;
        previewScale = 1;
    }

    function releaseOutput() {
        removePreview();

        if (outputUrl) {
            URL.revokeObjectURL(outputUrl);
            outputUrl = null;
        }

        outputBlob = null;

        resultActions.classList.add("d-none");
        downloadButton.disabled = true;

        compressedSizeElement.textContent = "-";
        reductionElement.textContent = "-";
    }

    async function handleFileSelection() {
        if (isProcessing) {
            return;
        }

        const version = ++selectionVersion;
        const file = fileInput.files?.[0];

        releaseOutput();
        clearStatus();

        selectedFile = null;
        selectedPdfBytes = null;
        selectedPageCount = 0;

        infoSection.classList.add("d-none");
        compressButton.disabled = true;

        fileNameElement.textContent = "";
        pageCountElement.textContent = "0 halaman";
        fileSizeElement.textContent = "0 B";

        originalSizeElement.textContent = "-";
        setReadyStatus("Belum siap");

        if (!file) {
            return;
        }

        try {
            validateFile(file);

            setStatus("Membaca file PDF...", "info");
            setReadyStatus("Memeriksa file");

            const buffer = await file.arrayBuffer();

            if (version !== selectionVersion) {
                return;
            }

            const bytes = normalizePdfBytes(new Uint8Array(buffer));

            // Inspect the PDF with pdf-lib, not PDF.js.
            const { PDFDocument } = getPdfLib();

            const document = await PDFDocument.load(bytes, {
                updateMetadata: false
            });

            if (version !== selectionVersion) {
                return;
            }

            selectedFile = file;
            selectedPdfBytes = bytes;
            selectedPageCount = document.getPageCount();

            fileNameElement.textContent = file.name;
            pageCountElement.textContent =
                `${selectedPageCount} halaman`;
            fileSizeElement.textContent = formatBytes(file.size);

            originalSizeElement.textContent = formatBytes(file.size);

            infoSection.classList.remove("d-none");

            setReadyStatus("Siap dikompres");
            setStatus("PDF berhasil dibaca dan siap diproses.", "success");

            compressButton.disabled = false;
            refreshIcons();
        } catch (error) {
            if (version !== selectionVersion) {
                return;
            }

            selectedFile = null;
            selectedPdfBytes = null;
            selectedPageCount = 0;

            setReadyStatus("Gagal membaca file");

            setStatus(
                error.message || "Gagal membaca file PDF.",
                "danger"
            );
        }
    }

    async function compressWithoutRasterization(bytes) {
        const { PDFDocument } = getPdfLib();

        const document = await PDFDocument.load(bytes, {
            updateMetadata: false
        });

        const result = await document.save({
            useObjectStreams: true,
            addDefaultPage: false
        });

        return new Uint8Array(result);
    }

    async function compressWithRasterization(bytes, settings) {
        const pdfjs = getPdfJs();
        const { PDFDocument } = getPdfLib();

        const loadingTask = pdfjs.getDocument({
            data: bytes.slice()
        });

        let sourceDocument = null;

        try {
            sourceDocument = await loadingTask.promise;

            const outputDocument = await PDFDocument.create();

            for (
                let pageNumber = 1;
                pageNumber <= sourceDocument.numPages;
                pageNumber++
            ) {
                setStatus(
                    `Mengoptimalkan halaman ${pageNumber} dari ${sourceDocument.numPages}...`,
                    "info"
                );

                const sourcePage =
                    await sourceDocument.getPage(pageNumber);

                const originalViewport = sourcePage.getViewport({
                    scale: 1
                });

                const renderViewport = sourcePage.getViewport({
                    scale: settings.scale
                });

                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", {
                    alpha: false
                });

                if (!context) {
                    throw new Error(
                        "Browser tidak dapat membuat canvas untuk kompresi."
                    );
                }

                canvas.width = Math.ceil(renderViewport.width);
                canvas.height = Math.ceil(renderViewport.height);

                try {
                    await sourcePage.render({
                        canvasContext: context,
                        viewport: renderViewport,
                        background: "#ffffff"
                    }).promise;

                    const imageBlob = await new Promise((resolve, reject) => {
                        canvas.toBlob(
                            (blob) => {
                                if (blob) {
                                    resolve(blob);
                                } else {
                                    reject(
                                        new Error("Gagal mengoptimalkan halaman PDF.")
                                    );
                                }
                            },
                            "image/jpeg",
                            settings.quality
                        );
                    });

                    const imageBytes = new Uint8Array(
                        await imageBlob.arrayBuffer()
                    );

                    const image = await outputDocument.embedJpg(imageBytes);

                    const outputPage = outputDocument.addPage([
                        originalViewport.width,
                        originalViewport.height
                    ]);

                    outputPage.drawImage(image, {
                        x: 0,
                        y: 0,
                        width: originalViewport.width,
                        height: originalViewport.height
                    });
                } finally {
                    canvas.width = 0;
                    canvas.height = 0;
                    sourcePage.cleanup();
                }
            }

            const result = await outputDocument.save({
                useObjectStreams: true,
                addDefaultPage: false
            });

            return new Uint8Array(result);
        } finally {
            if (sourceDocument) {
                await sourceDocument.destroy();
            } else {
                await loadingTask.destroy();
            }
        }
    }

    async function handleCompression(event) {
        event.preventDefault();

        if (isProcessing) {
            return;
        }

        if (!selectedFile || !selectedPdfBytes) {
            setStatus("Pilih file PDF terlebih dahulu.", "warning");
            return;
        }

        const sourceBytes = selectedPdfBytes.slice();
        const sourceSize = selectedFile.size;
        const level = getSelectedCompressionLevel();
        const settings = COMPRESSION_SETTINGS[level];

        releaseOutput();
        setProcessing(true);
        setReadyStatus("Sedang memproses");

        try {
            let resultBytes;

            if (settings.rasterize) {
                resultBytes = await compressWithRasterization(
                    sourceBytes,
                    settings
                );
            } else {
                setStatus("Mengoptimalkan struktur PDF...", "info");

                resultBytes = await compressWithoutRasterization(
                    sourceBytes
                );
            }

            if (!resultBytes?.length) {
                throw new Error("Hasil kompresi PDF kosong.");
            }

            outputBlob = new Blob(
                [resultBytes],
                { type: PDF_MIME_TYPE }
            );

            outputUrl = URL.createObjectURL(outputBlob);

            updateResultSummary(sourceSize, outputBlob.size);

            // Preview is initialized only after compression succeeds.
            setStatus("Kompresi selesai. Menyiapkan preview...", "info");

            try {
                await initializePreview(outputBlob);
            } catch (previewError) {
                console.error("[Compress PDF Preview]", previewError);

                setStatus(
                    "Kompresi berhasil, tetapi preview gagal dimuat. Kamu tetap bisa mengunduh PDF.",
                    "warning"
                );
            }

            setReadyStatus("Selesai");
            resultActions.classList.remove("d-none");
            downloadButton.disabled = false;

            if (outputBlob.size < sourceSize) {
                setStatus(
                    `Kompresi selesai menggunakan mode ${settings.name}.`,
                    "success"
                );
            } else {
                setStatus(
                    `Pemrosesan selesai menggunakan mode ${settings.name}, tetapi ukuran file tidak berkurang.`,
                    "warning"
                );
            }
        } catch (error) {
            releaseOutput();

            setReadyStatus("Gagal");

            setStatus(
                error.message || "Terjadi kesalahan saat memproses PDF.",
                "danger"
            );

            console.error("[Compress PDF]", error);
        } finally {
            setProcessing(false);
        }
    }

    function createPreviewMarkup() {
        const section = document.createElement("section");

        section.id = "pdfPreviewSection";
        section.className = "card mt-4";

        section.innerHTML = `
            <div class="card-header py-3">
                <div class="d-flex align-items-center justify-content-between gap-3">
                    <h2 class="h6 fw-semibold mb-0">
                        <i data-lucide="file-search"
                           class="me-2"
                           style="width: 18px; height: 18px;"></i>
                        Preview Hasil Kompresi
                    </h2>

                    <span id="pdfPreviewPageIndicator"
                          class="badge text-bg-light border">
                        Halaman 1
                    </span>
                </div>
            </div>

            <div class="card-body">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button type="button"
                            id="pdfPreviewPrevious"
                            class="btn btn-sm btn-outline-secondary">
                        <i data-lucide="chevron-left"
                           style="width: 16px; height: 16px;"></i>
                        Sebelumnya
                    </button>

                    <button type="button"
                            id="pdfPreviewNext"
                            class="btn btn-sm btn-outline-secondary">
                        Berikutnya
                        <i data-lucide="chevron-right"
                           style="width: 16px; height: 16px;"></i>
                    </button>

                    <div class="vr d-none d-sm-block mx-1"></div>

                    <button type="button"
                            id="pdfPreviewZoomOut"
                            class="btn btn-sm btn-outline-secondary"
                            aria-label="Perkecil preview">
                        <i data-lucide="minus"
                           style="width: 16px; height: 16px;"></i>
                    </button>

                    <span id="pdfPreviewZoomLabel"
                          class="small text-secondary">100%</span>

                    <button type="button"
                            id="pdfPreviewZoomIn"
                            class="btn btn-sm btn-outline-secondary"
                            aria-label="Perbesar preview">
                        <i data-lucide="plus"
                           style="width: 16px; height: 16px;"></i>
                    </button>
                </div>

                <div id="pdfPreviewStatus"
                     class="small text-secondary mb-3"
                     role="status"
                     aria-live="polite">
                    Menyiapkan preview...
                </div>

                <div class="border rounded bg-body-secondary p-2 p-md-3 text-center"
                     style="overflow: auto; max-height: 75vh;">
                    <canvas id="pdfPreviewCanvas"
                            class="bg-white shadow-sm"
                            style="display: inline-block; max-width: 100%; height: auto;"></canvas>
                </div>

                <p class="text-secondary small mt-3 mb-0">
                    Periksa keterbacaan dokumen sebelum mengunduhnya.
                </p>
            </div>
        `;

        resultActions.before(section);

        $("pdfPreviewPrevious").addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderPreviewPage();
            }
        });

        $("pdfPreviewNext").addEventListener("click", () => {
            if (previewDocument && currentPage < previewDocument.numPages) {
                currentPage++;
                renderPreviewPage();
            }
        });

        $("pdfPreviewZoomOut").addEventListener("click", () => {
            previewScale = Math.max(0.5, previewScale - 0.25);
            renderPreviewPage();
        });

        $("pdfPreviewZoomIn").addEventListener("click", () => {
            previewScale = Math.min(2.5, previewScale + 0.25);
            renderPreviewPage();
        });

        refreshIcons();

        return section;
    }

    async function initializePreview(blob) {
        const version = ++previewVersion;
        const pdfjs = getPdfJs();

        removePreview();

        // removePreview increments the version, so use the new version.
        const activeVersion = previewVersion;

        const section = createPreviewMarkup();

        section.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        const loadingTask = pdfjs.getDocument({
            data: new Uint8Array(await blob.arrayBuffer())
        });

        previewLoadingTask = loadingTask;

        const document = await loadingTask.promise;

        if (activeVersion !== previewVersion) {
            await document.destroy();
            return;
        }

        previewDocument = document;
        previewLoadingTask = null;

        currentPage = 1;
        previewScale = 1;

        await renderPreviewPage();
    }

    async function renderPreviewPage() {
        if (!previewDocument) {
            return;
        }

        const version = previewVersion;
        const document = previewDocument;
        const pageNumber = currentPage;

        const canvas = $("pdfPreviewCanvas");
        const status = $("pdfPreviewStatus");
        const indicator = $("pdfPreviewPageIndicator");
        const previousButton = $("pdfPreviewPrevious");
        const nextButton = $("pdfPreviewNext");
        const zoomLabel = $("pdfPreviewZoomLabel");

        if (
            !canvas ||
            !status ||
            !indicator ||
            !previousButton ||
            !nextButton ||
            !zoomLabel
        ) {
            return;
        }

        if (activeRenderTask) {
            try {
                activeRenderTask.cancel();
            } catch {
                // Ignore an already completed render.
            }

            activeRenderTask = null;
        }

        status.textContent = "Merender halaman...";
        indicator.textContent =
            `Halaman ${pageNumber} dari ${document.numPages}`;

        previousButton.disabled = pageNumber <= 1;
        nextButton.disabled = pageNumber >= document.numPages;

        zoomLabel.textContent =
            `${Math.round(previewScale * 100)}%`;

        try {
            const page = await document.getPage(pageNumber);

            if (
                version !== previewVersion ||
                document !== previewDocument
            ) {
                return;
            }

            const viewport = page.getViewport({
                scale: previewScale
            });

            const pixelRatio = Math.min(
                window.devicePixelRatio || 1,
                2
            );

            canvas.width = Math.ceil(viewport.width * pixelRatio);
            canvas.height = Math.ceil(viewport.height * pixelRatio);

            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            const context = canvas.getContext("2d", {
                alpha: false
            });

            if (!context) {
                throw new Error("Browser tidak dapat menampilkan preview PDF.");
            }

            context.setTransform(
                pixelRatio,
                0,
                0,
                pixelRatio,
                0,
                0
            );

            const renderTask = page.render({
                canvasContext: context,
                viewport,
                background: "#ffffff"
            });

            activeRenderTask = renderTask;

            await renderTask.promise;

            if (activeRenderTask === renderTask) {
                activeRenderTask = null;
            }

            if (
                version === previewVersion &&
                document === previewDocument
            ) {
                status.textContent = "Preview berhasil dimuat.";
            }
        } catch (error) {
            if (error?.name === "RenderingCancelledException") {
                return;
            }

            console.error("[PDF Preview]", error);

            if (version === previewVersion) {
                status.textContent = "Gagal menampilkan halaman PDF.";
            }
        }
    }

    function handleDownload() {
        if (!outputBlob || !outputUrl) {
            setStatus("Belum ada hasil PDF yang dapat diunduh.", "warning");
            return;
        }

        const link = document.createElement("a");

        link.href = outputUrl;
        link.download = getOutputFilename();

        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function handleReset() {
        if (isProcessing) {
            return;
        }

        selectionVersion++;

        fileInput.value = "";

        selectedFile = null;
        selectedPdfBytes = null;
        selectedPageCount = 0;

        releaseOutput();

        infoSection.classList.add("d-none");

        fileNameElement.textContent = "";
        pageCountElement.textContent = "0 halaman";
        fileSizeElement.textContent = "0 B";

        originalSizeElement.textContent = "-";
        compressedSizeElement.textContent = "-";
        reductionElement.textContent = "-";

        outputFilenameInput.value = DEFAULT_OUTPUT_NAME;

        const lightOption = form.querySelector(
            'input[name="compressionLevel"][value="light"]'
        );

        if (lightOption) {
            lightOption.checked = true;
        }

        setReadyStatus("Belum siap");
        clearStatus();
        setProcessing(false);

        refreshIcons();
    }

    fileInput.addEventListener("change", handleFileSelection);
    form.addEventListener("submit", handleCompression);
    downloadButton.addEventListener("click", handleDownload);
    resetButton.addEventListener("click", handleReset);

    window.addEventListener("beforeunload", () => {
        if (outputUrl) {
            URL.revokeObjectURL(outputUrl);
        }

        try {
            activeRenderTask?.cancel();
        } catch {
            // Ignore during page unload.
        }

        try {
            previewLoadingTask?.destroy();
        } catch {
            // Ignore during page unload.
        }

        try {
            previewDocument?.destroy();
        } catch {
            // Ignore during page unload.
        }
    });

    downloadButton.disabled = true;
    setReadyStatus("Belum siap");
    refreshIcons();
})();