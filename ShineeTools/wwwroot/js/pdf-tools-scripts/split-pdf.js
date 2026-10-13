(() => {
    "use strict";

    const MAX_FILE_SIZE = 25 * 1024 * 1024;

    const form = document.getElementById("splitPdfForm");
    const fileInput = document.getElementById("pdfFile");
    const statusElement = document.getElementById("pdfStatus");
    const infoSection = document.getElementById("pdfInfoSection");
    const fileNameElement = document.getElementById("pdfFileName");
    const pageCountElement = document.getElementById("pdfPageCount");
    const fileSizeElement = document.getElementById("pdfFileSize");

    const pageRangeSection = document.getElementById("pageRangeSection");
    const pageRangeInput = document.getElementById("pageRange");
    const splitHint = document.getElementById("splitHint");
    const outputFilename = document.getElementById("outputFilename");

    const summaryPageCount = document.getElementById("summaryPageCount");
    const summarySelectedPages = document.getElementById("summarySelectedPages");
    const summaryOutputFormat = document.getElementById("summaryOutputFormat");
    const summaryReadyStatus = document.getElementById("summaryReadyStatus");

    const splitButton = document.getElementById("splitPdf");
    const resetButton = document.getElementById("resetSplit");

    if (
        !form ||
        !fileInput ||
        !pageRangeInput ||
        !outputFilename ||
        !splitButton ||
        !window.PDFLib ||
        !window.JSZip
    ) {
        return;
    }

    const { PDFDocument } = window.PDFLib;

    let selectedFile = null;
    let sourceBytes = null;
    let totalPages = 0;
    let isProcessing = false;

    function formatFileSize(bytes) {
        if (bytes === 0) return "0 B";

        const units = ["B", "KB", "MB", "GB"];
        const index = Math.floor(Math.log(bytes) / Math.log(1024));

        return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
    }

    function showStatus(message, type = "info") {
        statusElement.className = `alert alert-${type} mt-3 mb-0`;
        statusElement.textContent = message;
    }

    function clearStatus() {
        statusElement.className = "alert d-none mt-3 mb-0";
        statusElement.textContent = "";
    }

    function getMode() {
        return form.querySelector('input[name="splitMode"]:checked')?.value ?? "all";
    }

    function getOutputName() {
        let name = outputFilename.value
            .trim()
            .replace(/\.pdf$/i, "")
            .replace(/\.zip$/i, "")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
            .replace(/[. ]+$/g, "")
            .trim();

        if (!name) {
            name = "split-document";
        }

        return name.slice(0, 100);
    }

    function parsePageRange(value) {
        const input = value.trim();

        if (!input) {
            throw new Error("Masukkan rentang halaman yang ingin diekstrak.");
        }

        const pages = new Set();
        const parts = input.split(",");

        for (const rawPart of parts) {
            const part = rawPart.trim();

            if (!part) {
                throw new Error("Format rentang halaman tidak valid.");
            }

            const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
            const singleMatch = part.match(/^(\d+)$/);

            let start;
            let end;

            if (rangeMatch) {
                start = Number(rangeMatch[1]);
                end = Number(rangeMatch[2]);

                if (start > end) {
                    throw new Error(
                        `Rentang ${part} tidak valid. Nomor awal harus lebih kecil atau sama dengan nomor akhir.`
                    );
                }
            } else if (singleMatch) {
                start = Number(singleMatch[1]);
                end = start;
            } else {
                throw new Error(
                    `Format "${part}" tidak valid. Gunakan contoh 1-3, 5, 8-10.`
                );
            }

            if (
                !Number.isSafeInteger(start) ||
                !Number.isSafeInteger(end) ||
                start < 1 ||
                end > totalPages
            ) {
                throw new Error(
                    `Nomor halaman harus berada di antara 1 dan ${totalPages}.`
                );
            }

            for (let page = start; page <= end; page++) {
                pages.add(page);
            }
        }

        return [...pages].sort((a, b) => a - b);
    }

    function getSelectedPages() {
        if (getMode() === "all") {
            return Array.from(
                { length: totalPages },
                (_, index) => index + 1
            );
        }

        return parsePageRange(pageRangeInput.value);
    }

    function updateSummary() {
        const mode = getMode();

        summaryPageCount.textContent = totalPages
            ? `${totalPages} halaman`
            : "-";

        summaryOutputFormat.textContent =
            mode === "all" ? "ZIP" : "PDF";

        pageRangeSection.classList.toggle("d-none", mode !== "extract");

        splitHint.textContent = mode === "all"
            ? "Setiap halaman menjadi file PDF tersendiri dan seluruh hasil diunduh dalam satu ZIP."
            : "Halaman yang dipilih akan digabungkan sesuai urutan nomor halaman menjadi satu PDF.";

        if (!selectedFile || !totalPages) {
            summarySelectedPages.textContent = "-";
            summaryReadyStatus.textContent = "Belum siap";
            splitButton.disabled = true;
            return;
        }

        try {
            const pages = getSelectedPages();

            summarySelectedPages.textContent = `${pages.length} halaman`;
            summaryReadyStatus.textContent = "Siap diproses";
            splitButton.disabled = isProcessing || pages.length === 0;
        } catch {
            summarySelectedPages.textContent = "Rentang tidak valid";
            summaryReadyStatus.textContent = "Periksa pengaturan";
            splitButton.disabled = true;
        }

        if (isProcessing) {
            splitButton.disabled = true;
        }
    }

    async function loadPdf(file) {
        if (!file) return;

        if (!/\.pdf$/i.test(file.name)) {
            showStatus("Pilih file dengan ekstensi PDF.", "danger");
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            showStatus("Ukuran file melebihi batas maksimal 25 MB.", "danger");
            return;
        }

        if (file.size === 0) {
            showStatus("File PDF kosong dan tidak dapat diproses.", "danger");
            return;
        }

        clearStatus();
        splitButton.disabled = true;

        try {
            const bytes = new Uint8Array(await file.arrayBuffer());

            const document = await PDFDocument.load(bytes, {
                updateMetadata: false
            });

            selectedFile = file;
            sourceBytes = bytes;
            totalPages = document.getPageCount();

            if (totalPages < 1) {
                throw new Error("Dokumen tidak memiliki halaman.");
            }

            infoSection.classList.remove("d-none");
            fileNameElement.textContent = file.name;
            pageCountElement.textContent = `${totalPages} halaman`;
            fileSizeElement.textContent = formatFileSize(file.size);

            const defaultName = file.name.replace(/\.pdf$/i, "");
            outputFilename.value = `${defaultName}-split`.slice(0, 100);

            updateSummary();
            showStatus("PDF berhasil dibaca dan siap diproses.", "success");
        } catch (error) {
            selectedFile = null;
            sourceBytes = null;
            totalPages = 0;

            infoSection.classList.add("d-none");
            updateSummary();

            showStatus(
                error.message?.includes("halaman")
                    ? error.message
                    : "File PDF tidak dapat dibaca. Pastikan dokumen valid dan tidak rusak atau terenkripsi.",
                "danger"
            );
        }
    }

    async function splitAllPages() {
        const zip = new JSZip();
        const baseName = getOutputName();

        for (let index = 0; index < totalPages; index++) {
            const pdf = await PDFDocument.create();
            const source = await PDFDocument.load(sourceBytes, {
                updateMetadata: false
            });

            const [page] = await pdf.copyPages(source, [index]);
            pdf.addPage(page);

            const bytes = await pdf.save();

            const pageNumber = String(index + 1).padStart(
                String(totalPages).length,
                "0"
            );

            zip.file(`${baseName}-page-${pageNumber}.pdf`, bytes);
        }

        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 3 }
        });

        downloadBlob(zipBlob, `${baseName}.zip`);
    }

    async function extractPages() {
        const pageNumbers = getSelectedPages();
        const outputPdf = await PDFDocument.create();

        const source = await PDFDocument.load(sourceBytes, {
            updateMetadata: false
        });

        const zeroBasedIndices = pageNumbers.map(page => page - 1);
        const copiedPages = await outputPdf.copyPages(
            source,
            zeroBasedIndices
        );

        copiedPages.forEach(page => outputPdf.addPage(page));

        const bytes = await outputPdf.save();

        downloadBlob(
            new Blob([bytes], { type: "application/pdf" }),
            `${getOutputName()}.pdf`
        );
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function processPdf() {
        if (!selectedFile || !sourceBytes || isProcessing) {
            return;
        }

        try {
            getSelectedPages();
        } catch (error) {
            showStatus(error.message, "danger");
            updateSummary();
            return;
        }

        isProcessing = true;
        splitButton.disabled = true;
        splitButton.textContent = "Memproses PDF...";
        summaryReadyStatus.textContent = "Sedang diproses";

        try {
            if (getMode() === "all") {
                showStatus(
                    `Memisahkan ${totalPages} halaman. Mohon tunggu...`,
                    "info"
                );

                await splitAllPages();
            } else {
                showStatus("Mengekstrak halaman pilihan...", "info");
                await extractPages();
            }

            showStatus("PDF berhasil diproses dan unduhan telah dimulai.", "success");
            summaryReadyStatus.textContent = "Selesai";
        } catch (error) {
            console.error("Split PDF error:", error);

            showStatus(
                "Gagal memproses PDF. Coba file lain atau periksa apakah dokumen memiliki proteksi.",
                "danger"
            );

            summaryReadyStatus.textContent = "Gagal";
        } finally {
            isProcessing = false;

            splitButton.innerHTML =
                '<i data-lucide="scissors" class="me-1" style="width: 18px; height: 18px;"></i> Pisahkan PDF';

            if (window.lucide) {
                window.lucide.createIcons();
            }

            updateSummary();
        }
    }

    function resetAll() {
        if (isProcessing) return;

        form.reset();
        fileInput.value = "";
        pageRangeInput.value = "";

        selectedFile = null;
        sourceBytes = null;
        totalPages = 0;

        infoSection.classList.add("d-none");
        outputFilename.value = "split-document";

        clearStatus();
        updateSummary();
    }

    fileInput.addEventListener("change", event => {
        loadPdf(event.target.files?.[0]);
    });

    form.querySelectorAll('input[name="splitMode"]').forEach(input => {
        input.addEventListener("change", updateSummary);
    });

    pageRangeInput.addEventListener("input", updateSummary);
    outputFilename.addEventListener("input", updateSummary);

    form.addEventListener("submit", event => {
        event.preventDefault();
        processPdf();
    });

    resetButton.addEventListener("click", resetAll);

    updateSummary();
})();