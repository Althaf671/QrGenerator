(() => {
    "use strict";

    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    const PDF_MIME_TYPE = "application/pdf";
    const PREVIEW_SCALE = 0.7;

    const form = document.getElementById("rotatePdfForm");
    const pdfFileInput = document.getElementById("pdfFile");
    const pdfStatus = document.getElementById("pdfStatus");
    const pdfInfoSection = document.getElementById("pdfInfoSection");
    const pdfFileName = document.getElementById("pdfFileName");
    const pdfPageCount = document.getElementById("pdfPageCount");
    const pdfFileSize = document.getElementById("pdfFileSize");

    const previewEmpty = document.getElementById("previewEmpty");
    const previewLoading = document.getElementById("previewLoading");
    const pagePreviewGrid = document.getElementById("pagePreviewGrid");
    const selectionCount = document.getElementById("selectionCount");

    const selectAllPagesButton = document.getElementById("selectAllPages");
    const deselectAllPagesButton = document.getElementById("deselectAllPages");
    const rotateSelectedLeftButton = document.getElementById("rotateSelectedLeft");
    const rotateSelectedRightButton = document.getElementById("rotateSelectedRight");
    const resetPageRotationsButton = document.getElementById("resetPageRotations");

    const outputFilenameInput = document.getElementById("outputFilename");
    const saveRotatedPdfButton = document.getElementById("saveRotatedPdf");
    const resetRotatePdfButton = document.getElementById("resetRotatePdf");

    const summaryPageCount = document.getElementById("summaryPageCount");
    const summarySelectedPages = document.getElementById("summarySelectedPages");
    const summaryRotatedPages = document.getElementById("summaryRotatedPages");
    const summaryReadyStatus = document.getElementById("summaryReadyStatus");

    const requiredElements = [
        form,
        pdfFileInput,
        pdfStatus,
        pdfInfoSection,
        previewEmpty,
        previewLoading,
        pagePreviewGrid,
        selectionCount,
        selectAllPagesButton,
        deselectAllPagesButton,
        rotateSelectedLeftButton,
        rotateSelectedRightButton,
        resetPageRotationsButton,
        outputFilenameInput,
        saveRotatedPdfButton,
        resetRotatePdfButton
    ];

    if (
        requiredElements.some(element => !element) ||
        !window.PDFLib ||
        !window.pdfjsLib
    ) {
        console.error(
            "Rotate PDF: elemen HTML atau library PDFLib/PDF.js tidak tersedia."
        );
        return;
    }

    const { PDFDocument, degrees } = window.PDFLib;

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    let originalBytes = null;
    let pdfDocument = null;
    let previewDocument = null;
    let pageStates = [];

    let isLoading = false;
    let isSaving = false;
    let operationId = 0;
    let loadController = null;

    // Menyimpan render task agar canvas yang sama tidak dirender bersamaan.
    const renderTasks = new Map();

    function setText(element, value) {
        if (element) {
            element.textContent = value;
        }
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function refreshIcons() {
        window.lucide?.createIcons();
    }

    function showStatus(message, type = "info") {
        pdfStatus.textContent = message;
        pdfStatus.className = `alert alert-${type} mt-3 mb-0`;
    }

    function clearStatus() {
        pdfStatus.textContent = "";
        pdfStatus.className = "alert d-none mt-3 mb-0";
    }

    function getOutputName() {
        let name = outputFilenameInput.value.trim();

        name = name
            .replace(/\.pdf$/i, "")
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
            .replace(/\s+/g, " ")
            .trim();

        return name || "rotated-document";
    }

    function getSelectedPages() {
        return pageStates
            .map((page, index) => page.selected ? index : -1)
            .filter(index => index !== -1);
    }

    function getRotatedPages() {
        return pageStates
            .map((page, index) => page.rotationDelta !== 0 ? index : -1)
            .filter(index => index !== -1);
    }

    function updateSummary() {
        const selectedCount = getSelectedPages().length;
        const rotatedCount = getRotatedPages().length;
        const hasDocument = Boolean(pdfDocument);
        const locked = isLoading || isSaving;

        setText(selectionCount, `${selectedCount} dipilih`);
        setText(
            summaryPageCount,
            hasDocument ? `${pageStates.length} halaman` : "-"
        );
        setText(
            summarySelectedPages,
            hasDocument ? `${selectedCount} halaman` : "-"
        );
        setText(
            summaryRotatedPages,
            hasDocument ? `${rotatedCount} halaman` : "-"
        );
        setText(
            summaryReadyStatus,
            isLoading
                ? "Memuat dokumen..."
                : isSaving
                    ? "Menyimpan..."
                    : hasDocument
                        ? "Siap diproses"
                        : "Belum siap"
        );

        selectAllPagesButton.disabled = !hasDocument || locked;
        deselectAllPagesButton.disabled = !hasDocument || locked;

        rotateSelectedLeftButton.disabled =
            !hasDocument || selectedCount === 0 || locked;

        rotateSelectedRightButton.disabled =
            !hasDocument || selectedCount === 0 || locked;

        resetPageRotationsButton.disabled =
            !hasDocument || rotatedCount === 0 || locked;

        saveRotatedPdfButton.disabled =
            !hasDocument || rotatedCount === 0 || locked;

        pdfFileInput.disabled = locked;
        resetRotatePdfButton.disabled = locked;
        outputFilenameInput.disabled = locked;
    }

    function getEffectiveRotation(pageIndex) {
        const originalAngle = pdfDocument
            .getPage(pageIndex)
            .getRotation()
            .angle;

        const delta = pageStates[pageIndex].rotationDelta;

        return ((originalAngle + delta) % 360 + 360) % 360;
    }

    function isRenderCancellation(error) {
        return error?.name === "RenderingCancelledException";
    }

    async function cancelRender(pageIndex) {
        const task = renderTasks.get(pageIndex);

        if (!task) {
            return;
        }

        renderTasks.delete(pageIndex);

        try {
            task.cancel();
            await task.promise;
        } catch (error) {
            if (!isRenderCancellation(error)) {
                throw error;
            }
        }
    }

    async function updatePageCard(pageIndex) {
        const state = pageStates[pageIndex];

        const card = pagePreviewGrid.querySelector(
            `[data-page-index="${pageIndex}"]`
        );

        if (!card || !state || !previewDocument || !pdfDocument) {
            return;
        }

        const checkbox = card.querySelector(".page-select");
        const rotationLabel = card.querySelector(".page-rotation");
        const canvas = card.querySelector("canvas");

        checkbox.checked = state.selected;

        rotationLabel.textContent =
            `${getEffectiveRotation(pageIndex)}°`;

        card.classList.toggle("border-primary", state.selected);
        card.classList.toggle("bg-body-tertiary", state.selected);

        // Batalkan render sebelumnya sebelum mengubah ukuran canvas.
        await cancelRender(pageIndex);

        const page = await previewDocument.getPage(pageIndex + 1);

        const viewport = page.getViewport({
            scale: PREVIEW_SCALE,
            rotation: getEffectiveRotation(pageIndex)
        });

        const context = canvas.getContext("2d");

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";

        const task = page.render({
            canvasContext: context,
            viewport
        });

        renderTasks.set(pageIndex, task);

        try {
            await task.promise;
        } finally {
            if (renderTasks.get(pageIndex) === task) {
                renderTasks.delete(pageIndex);
            }
        }
    }

    function createPageCard(pageIndex) {
        const column = document.createElement("div");
        column.className = "col-6 col-md-4 col-xl-3";

        const card = document.createElement("div");
        card.className = "card h-100";
        card.dataset.pageIndex = String(pageIndex);

        const cardBody = document.createElement("div");
        cardBody.className = "card-body p-2";

        const topRow = document.createElement("div");
        topRow.className =
            "d-flex align-items-center justify-content-between gap-2 mb-2";

        const label = document.createElement("label");
        label.className = "d-flex align-items-center gap-2 min-w-0";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input page-select flex-shrink-0";
        checkbox.setAttribute(
            "aria-label",
            `Pilih halaman ${pageIndex + 1}`
        );

        const pageNumber = document.createElement("span");
        pageNumber.className = "small fw-medium";
        pageNumber.textContent = `Halaman ${pageIndex + 1}`;

        label.append(checkbox, pageNumber);

        const rotationLabel = document.createElement("span");
        rotationLabel.className =
            "badge text-bg-secondary page-rotation";

        const canvasWrapper = document.createElement("div");
        canvasWrapper.className =
            "d-flex align-items-center justify-content-center bg-body-secondary rounded p-2";

        const canvas = document.createElement("canvas");
        canvas.className = "bg-white shadow-sm";
        canvas.setAttribute(
            "aria-label",
            `Preview halaman ${pageIndex + 1}`
        );

        canvasWrapper.appendChild(canvas);
        topRow.append(label, rotationLabel);
        cardBody.append(topRow, canvasWrapper);
        card.appendChild(cardBody);
        column.appendChild(card);

        checkbox.addEventListener("change", () => {
            const state = pageStates[pageIndex];

            if (!state) {
                return;
            }

            state.selected = checkbox.checked;
            card.classList.toggle("border-primary", state.selected);
            card.classList.toggle("bg-body-tertiary", state.selected);

            updateSummary();
        });

        return {
            element: column,
            render: () => updatePageCard(pageIndex)
        };
    }

    async function destroyPreview() {
        for (const pageIndex of [...renderTasks.keys()]) {
            try {
                await cancelRender(pageIndex);
            } catch (error) {
                console.warn("Rotate PDF: pembersihan render gagal.", error);
            }
        }

        if (previewDocument) {
            const oldDocument = previewDocument;
            previewDocument = null;

            try {
                await oldDocument.destroy();
            } catch (error) {
                console.warn(
                    "Rotate PDF: pembersihan dokumen preview gagal.",
                    error
                );
            }
        }
    }

    async function renderAllPages(currentOperation) {
        pagePreviewGrid.replaceChildren();
        previewEmpty.classList.add("d-none");
        previewLoading.classList.remove("d-none");

        const cards = [];

        for (let index = 0; index < pageStates.length; index++) {
            if (currentOperation !== operationId) {
                return;
            }

            const card = createPageCard(index);

            cards.push(card);
            pagePreviewGrid.appendChild(card.element);
        }

        for (const card of cards) {
            if (currentOperation !== operationId) {
                return;
            }

            await card.render();
        }

        if (currentOperation !== operationId) {
            return;
        }

        previewLoading.classList.add("d-none");
        updateSummary();
        refreshIcons();
    }

    function resetDocumentState() {
        originalBytes = null;
        pdfDocument = null;
        previewDocument = null;
        pageStates = [];

        pagePreviewGrid.replaceChildren();
        pdfInfoSection.classList.add("d-none");
        previewEmpty.classList.remove("d-none");
        previewLoading.classList.add("d-none");
    }

    function getLoadErrorMessage(stage, error) {
        const message = error?.message || String(error);

        console.error(
            `Rotate PDF: gagal pada tahap ${stage}.`,
            error
        );

        if (stage === "pdf-lib") {
            return `PDF gagal diproses oleh pdf-lib: ${message}`;
        }

        if (stage === "pdfjs") {
            return `PDF berhasil dibaca, tetapi preview gagal dibuat: ${message}`;
        }

        if (stage === "preview") {
            return `Gagal merender preview halaman: ${message}`;
        }

        return `Gagal membaca PDF: ${message}`;
    }

    async function loadPdf(file) {
        const currentOperation = ++operationId;

        loadController?.abort();
        loadController = new AbortController();

        await destroyPreview();

        if (currentOperation !== operationId) {
            return;
        }

        resetDocumentState();
        clearStatus();

        if (!file) {
            updateSummary();
            return;
        }

        if (file.size === 0) {
            showStatus("File PDF kosong.", "danger");
            updateSummary();
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            showStatus("Ukuran file melebihi batas 25 MB.", "danger");
            updateSummary();
            return;
        }

        if (
            file.type !== PDF_MIME_TYPE &&
            !file.name.toLowerCase().endsWith(".pdf")
        ) {
            showStatus("Pilih file dengan format PDF.", "danger");
            updateSummary();
            return;
        }

        isLoading = true;
        updateSummary();
        showStatus("Membaca dokumen PDF...", "info");

        let stage = "file";

        try {
            const bytes = new Uint8Array(await file.arrayBuffer());

            if (currentOperation !== operationId) {
                return;
            }

            stage = "pdf-lib";

            const pdf = await PDFDocument.load(bytes.slice(), {
                ignoreEncryption: false,
                updateMetadata: false
            });

            if (pdf.getPageCount() === 0) {
                throw new Error("Dokumen tidak memiliki halaman.");
            }

            if (currentOperation !== operationId) {
                return;
            }

            stage = "pdfjs";

            const loadingTask = window.pdfjsLib.getDocument({
                data: bytes.slice()
            });

            const preview = await loadingTask.promise;

            if (currentOperation !== operationId) {
                await preview.destroy();
                return;
            }

            originalBytes = bytes;
            pdfDocument = pdf;
            previewDocument = preview;

            pageStates = Array.from(
                { length: pdf.getPageCount() },
                () => ({
                    selected: false,
                    rotationDelta: 0
                })
            );

            setText(pdfFileName, file.name);
            setText(pdfPageCount, `${pdf.getPageCount()} halaman`);
            setText(pdfFileSize, formatFileSize(file.size));

            pdfInfoSection.classList.remove("d-none");

            outputFilenameInput.value =
                file.name.replace(/\.pdf$/i, "") + "-rotated";

            stage = "preview";

            await renderAllPages(currentOperation);

            if (currentOperation !== operationId) {
                return;
            }

            showStatus(
                "PDF berhasil dimuat. Pilih halaman untuk memulai rotasi.",
                "success"
            );
        } catch (error) {
            if (currentOperation !== operationId) {
                return;
            }

            await destroyPreview();
            resetDocumentState();

            showStatus(getLoadErrorMessage(stage, error), "danger");
        } finally {
            if (currentOperation === operationId) {
                isLoading = false;
                updateSummary();
            }
        }
    }

    async function rotateSelectedPages(direction) {
        if (!pdfDocument || isLoading || isSaving) {
            return;
        }

        const selectedPages = getSelectedPages();

        if (selectedPages.length === 0) {
            showStatus(
                "Pilih setidaknya satu halaman untuk diputar.",
                "warning"
            );
            return;
        }

        const delta = direction === "left" ? -90 : 90;
        const currentOperation = operationId;

        for (const pageIndex of selectedPages) {
            pageStates[pageIndex].rotationDelta =
                (pageStates[pageIndex].rotationDelta + delta + 360) % 360;
        }

        updateSummary();
        showStatus(
            `${selectedPages.length} halaman diperbarui.`,
            "info"
        );

        try {
            for (const pageIndex of selectedPages) {
                if (currentOperation !== operationId) {
                    return;
                }

                await updatePageCard(pageIndex);
            }

            if (currentOperation === operationId) {
                showStatus(
                    `${selectedPages.length} halaman diputar. Periksa preview sebelum menyimpan.`,
                    "success"
                );
            }
        } catch (error) {
            console.error("Rotate PDF: gagal memperbarui preview.", error);
            showStatus(
                `Preview gagal diperbarui: ${error?.message || error}`,
                "danger"
            );
        }
    }

    async function resetPageRotations() {
        if (!pdfDocument || isLoading || isSaving) {
            return;
        }

        const currentOperation = operationId;

        pageStates.forEach(page => {
            page.rotationDelta = 0;
        });

        updateSummary();

        try {
            for (let index = 0; index < pageStates.length; index++) {
                if (currentOperation !== operationId) {
                    return;
                }

                await updatePageCard(index);
            }

            showStatus(
                "Rotasi semua halaman dikembalikan ke orientasi awal.",
                "success"
            );
        } catch (error) {
            console.error("Rotate PDF: gagal mereset rotasi.", error);
            showStatus(
                `Preview gagal diperbarui: ${error?.message || error}`,
                "danger"
            );
        }
    }

    async function saveRotatedPdf(event) {
        event.preventDefault();

        if (!pdfDocument || !originalBytes || isLoading || isSaving) {
            return;
        }

        const rotatedPages = getRotatedPages();

        if (rotatedPages.length === 0) {
            showStatus(
                "Belum ada perubahan rotasi pada dokumen.",
                "warning"
            );
            return;
        }

        isSaving = true;
        updateSummary();
        showStatus("Menerapkan rotasi dan menyiapkan PDF...", "info");

        try {
            const outputDocument = await PDFDocument.load(
                originalBytes.slice(),
                {
                    ignoreEncryption: false,
                    updateMetadata: false
                }
            );

            for (let index = 0; index < pageStates.length; index++) {
                const delta = pageStates[index].rotationDelta;

                if (delta === 0) {
                    continue;
                }

                const page = outputDocument.getPage(index);
                const originalAngle = page.getRotation().angle;

                page.setRotation(
                    degrees((originalAngle + delta + 360) % 360)
                );
            }

            const outputBytes = await outputDocument.save();

            const blob = new Blob([outputBytes], {
                type: PDF_MIME_TYPE
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `${getOutputName()}.pdf`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);

            showStatus(
                `PDF berhasil disimpan. ${rotatedPages.length} halaman diputar.`,
                "success"
            );
        } catch (error) {
            console.error("Rotate PDF: gagal menyimpan dokumen.", error);

            showStatus(
                `PDF gagal disimpan: ${error?.message || error}`,
                "danger"
            );
        } finally {
            isSaving = false;
            updateSummary();
        }
    }

    async function resetAll() {
        if (isLoading || isSaving) {
            return;
        }

        operationId++;
        loadController?.abort();

        await destroyPreview();

        resetDocumentState();

        pdfFileInput.value = "";
        outputFilenameInput.value = "rotated-document";

        clearStatus();
        updateSummary();
        refreshIcons();
    }

    pdfFileInput.addEventListener("change", () => {
        // loadPdf menangani pembatalan dan pembersihan preview sebelumnya.
        void loadPdf(pdfFileInput.files?.[0] ?? null);
    });

    selectAllPagesButton.addEventListener("click", () => {
        pageStates.forEach(page => {
            page.selected = true;
        });

        pagePreviewGrid.querySelectorAll(".page-select").forEach(checkbox => {
            checkbox.checked = true;
        });

        pagePreviewGrid.querySelectorAll("[data-page-index]").forEach(card => {
            card.classList.add("border-primary", "bg-body-tertiary");
        });

        updateSummary();
    });

    deselectAllPagesButton.addEventListener("click", () => {
        pageStates.forEach(page => {
            page.selected = false;
        });

        pagePreviewGrid.querySelectorAll(".page-select").forEach(checkbox => {
            checkbox.checked = false;
        });

        pagePreviewGrid.querySelectorAll("[data-page-index]").forEach(card => {
            card.classList.remove("border-primary", "bg-body-tertiary");
        });

        updateSummary();
    });

    rotateSelectedLeftButton.addEventListener("click", () => {
        void rotateSelectedPages("left");
    });

    rotateSelectedRightButton.addEventListener("click", () => {
        void rotateSelectedPages("right");
    });

    resetPageRotationsButton.addEventListener("click", () => {
        void resetPageRotations();
    });

    form.addEventListener("submit", saveRotatedPdf);

    resetRotatePdfButton.addEventListener("click", () => {
        void resetAll();
    });

    updateSummary();
})();