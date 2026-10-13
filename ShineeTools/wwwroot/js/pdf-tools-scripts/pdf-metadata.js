(() => {
    "use strict";

    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    const PDF_MIME_TYPE = "application/pdf";

    const form = document.getElementById("pdfMetadataForm");
    const fileInput = document.getElementById("pdfFile");
    const statusElement = document.getElementById("pdfStatus");
    const infoSection = document.getElementById("pdfInfoSection");

    const fileNameElement = document.getElementById("pdfFileName");
    const pageCountElement = document.getElementById("pdfPageCount");
    const fileSizeElement = document.getElementById("pdfFileSize");
    const versionElement = document.getElementById("pdfVersion");

    const metadataFields = {
        title: document.getElementById("metadataTitle"),
        author: document.getElementById("metadataAuthor"),
        subject: document.getElementById("metadataSubject"),
        keywords: document.getElementById("metadataKeywords"),
        creator: document.getElementById("metadataCreator"),
        producer: document.getElementById("metadataProducer"),
        creationDate: document.getElementById("metadataCreationDate"),
        modificationDate: document.getElementById("metadataModificationDate")
    };

    const technicalVersion = document.getElementById("technicalVersion");
    const technicalPageCount = document.getElementById("technicalPageCount");
    const technicalFileSize = document.getElementById("technicalFileSize");
    const technicalEncryption = document.getElementById("technicalEncryption");
    const technicalForms = document.getElementById("technicalForms");
    const technicalJavaScript = document.getElementById("technicalJavaScript");
    const technicalXmp = document.getElementById("technicalXmp");
    const technicalLinearized = document.getElementById("technicalLinearized");

    const rawMetadata = document.getElementById("rawMetadata");
    const xmpMetadata = document.getElementById("xmpMetadata");
    const jsonMetadata = document.getElementById("jsonMetadata");
    const copyJsonButton = document.getElementById("copyJsonMetadata");

    const outputFilename = document.getElementById("outputFilename");

    const summaryPageCount = document.getElementById("summaryPageCount");
    const summaryMetadataCount = document.getElementById("summaryMetadataCount");
    const summaryChanges = document.getElementById("summaryChanges");
    const summaryReadyStatus = document.getElementById("summaryReadyStatus");

    const saveButton = document.getElementById("saveMetadata");
    const resetButton = document.getElementById("resetMetadata");

    if (
        !form ||
        !fileInput ||
        !statusElement ||
        !infoSection ||
        !outputFilename ||
        !saveButton ||
        !resetButton ||
        !jsonMetadata
    ) {
        return;
    }

    let sourceFile = null;
    let originalBytes = null;
    let pdfDocument = null;
    let originalMetadata = null;
    let isReading = false;
    let isSaving = false;

    const metadataLabels = {
        title: "Judul",
        author: "Penulis",
        subject: "Subjek",
        keywords: "Kata kunci",
        creator: "Creator",
        producer: "Producer",
        creationDate: "Tanggal dibuat",
        modificationDate: "Tanggal modifikasi"
    };

    function formatFileSize(bytes) {
        if (bytes === 0) {
            return "0 B";
        }

        const units = ["B", "KB", "MB", "GB"];
        const index = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1
        );

        return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
    }

    function showStatus(message, type = "info") {
        const allowedTypes = ["info", "success", "warning", "danger"];
        const alertType = allowedTypes.includes(type) ? type : "info";

        statusElement.className = `alert alert-${alertType} mt-3 mb-0`;
        statusElement.textContent = message;
    }

    function clearStatus() {
        statusElement.textContent = "";
        statusElement.className = "alert d-none mt-3 mb-0";
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function setText(element, value) {
        if (element) {
            element.textContent = value ?? "-";
        }
    }

    function getPdfLib() {
        return window.PDFLib?.PDFDocument ? window.PDFLib : null;
    }

    function normalizeDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return "";
        }

        return date.toISOString();
    }

    function parsePdfDate(value) {
        if (!value) {
            return null;
        }

        const input = value.trim();

        // Format tanggal PDF: D:YYYYMMDDHHmmSS
        // Offset zona waktu tidak diterapkan oleh parser sederhana ini.
        const match = input.match(
            /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/
        );

        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2] || "01");
            const day = Number(match[3] || "01");
            const hour = Number(match[4] || "00");
            const minute = Number(match[5] || "00");
            const second = Number(match[6] || "00");

            const date = new Date(
                year,
                month - 1,
                day,
                hour,
                minute,
                second
            );

            return Number.isNaN(date.getTime()) ? null : date;
        }

        const date = new Date(input);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function getFormValues() {
        return {
            title: metadataFields.title.value.trim(),
            author: metadataFields.author.value.trim(),
            subject: metadataFields.subject.value.trim(),
            keywords: metadataFields.keywords.value
                .split(",")
                .map(keyword => keyword.trim())
                .filter(Boolean),
            creator: metadataFields.creator.value.trim(),
            producer: metadataFields.producer.value.trim(),
            creationDate: metadataFields.creationDate.value.trim(),
            modificationDate: metadataFields.modificationDate.value.trim()
        };
    }

    function getCurrentMetadata() {
        const values = getFormValues();

        return {
            title: values.title || null,
            author: values.author || null,
            subject: values.subject || null,
            keywords: values.keywords,
            creator: values.creator || null,
            producer: values.producer || null,
            creationDate: values.creationDate || null,
            modificationDate: values.modificationDate || null
        };
    }

    function getMetadataCount(metadata) {
        return Object.values(metadata).filter(value => {
            if (Array.isArray(value)) {
                return value.length > 0;
            }

            return value !== null && value !== "";
        }).length;
    }

    function getChangedFields() {
        if (!originalMetadata) {
            return [];
        }

        const current = getFormValues();
        const changed = [];

        for (const key of Object.keys(metadataLabels)) {
            let originalValue = originalMetadata[key];
            let currentValue = current[key];

            if (Array.isArray(originalValue)) {
                originalValue = originalValue.join(", ");
            }

            if (Array.isArray(currentValue)) {
                currentValue = currentValue.join(", ");
            }

            if (originalValue !== currentValue) {
                changed.push({
                    field: key,
                    label: metadataLabels[key],
                    originalValue,
                    currentValue
                });
            }
        }

        return changed;
    }

    function buildJsonMetadata() {
        const metadata = getCurrentMetadata();
        const changedFields = getChangedFields();

        return {
            document: {
                fileName: sourceFile?.name ?? null,
                fileSizeBytes: sourceFile?.size ?? null,
                fileSize: sourceFile ? formatFileSize(sourceFile.size) : null,
                pageCount: pdfDocument?.getPageCount() ?? null,
                pdfVersion: null
            },
            metadata,
            technical: {
                encryption: "not_verified",
                interactiveForms: "not_verified",
                javascript: "not_verified",
                xmpMetadata: "not_inspected",
                linearized: "not_verified"
            },
            changes: {
                count: changedFields.length,
                fields: changedFields
            }
        };
    }

    function updateJsonMetadata() {
        jsonMetadata.value = JSON.stringify(
            buildJsonMetadata(),
            null,
            2
        );

        if (copyJsonButton) {
            copyJsonButton.disabled = !pdfDocument || isReading;
        }
    }

    function updateRawMetadata() {
        if (!rawMetadata) {
            return;
        }

        rawMetadata.value = JSON.stringify(
            getCurrentMetadata(),
            null,
            2
        );
    }

    function updateSummary() {
        const metadata = getCurrentMetadata();
        const changedFields = getChangedFields();
        const ready = Boolean(sourceFile && pdfDocument && !isReading && !isSaving);

        setText(
            summaryMetadataCount,
            `${getMetadataCount(metadata)} field`
        );

        setText(
            summaryChanges,
            changedFields.length > 0
                ? `${changedFields.length} field`
                : "Belum ada"
        );

        setText(
            summaryReadyStatus,
            ready ? "Siap diproses" : "Belum siap"
        );

        saveButton.disabled = !ready;

        fileInput.disabled = isReading || isSaving;
        outputFilename.disabled = isReading || isSaving;

        for (const field of Object.values(metadataFields)) {
            field.disabled = isReading || isSaving || !pdfDocument;
        }

        resetButton.disabled = isReading || isSaving;

        updateJsonMetadata();
    }

    function populateMetadata(metadata) {
        metadataFields.title.value = metadata.title;
        metadataFields.author.value = metadata.author;
        metadataFields.subject.value = metadata.subject;
        metadataFields.keywords.value = metadata.keywords.join(", ");
        metadataFields.creator.value = metadata.creator;
        metadataFields.producer.value = metadata.producer;
        metadataFields.creationDate.value = metadata.creationDate;
        metadataFields.modificationDate.value = metadata.modificationDate;
    }

    function readMetadata() {
        const metadata = {
            title: pdfDocument.getTitle() || "",
            author: pdfDocument.getAuthor() || "",
            subject: pdfDocument.getSubject() || "",
            keywords: pdfDocument.getKeywords()
                ? pdfDocument.getKeywords()
                    .split(",")
                    .map(keyword => keyword.trim())
                    .filter(Boolean)
                : [],
            creator: pdfDocument.getCreator() || "",
            producer: pdfDocument.getProducer() || "",
            creationDate: normalizeDate(pdfDocument.getCreationDate()),
            modificationDate: normalizeDate(pdfDocument.getModificationDate())
        };

        return metadata;
    }

    function resetTechnicalInformation() {
        setText(technicalVersion, "Tidak tersedia");
        setText(technicalEncryption, "Tidak diverifikasi");
        setText(technicalForms, "Tidak diverifikasi");
        setText(technicalJavaScript, "Tidak diverifikasi");
        setText(technicalXmp, "Tidak diverifikasi");
        setText(technicalLinearized, "Tidak diverifikasi");

        if (xmpMetadata) {
            xmpMetadata.value = "";
        }
    }

    function getOutputName() {
        const rawName = outputFilename.value.trim() || "edited-document";

        const safeName = rawName
            .replace(/\.pdf$/i, "")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
            .replace(/[. ]+$/g, "")
            .trim();

        return `${safeName || "edited-document"}.pdf`;
    }

    async function loadPdf(file) {
        if (isReading || isSaving) {
            return;
        }

        if (!file) {
            return;
        }

        if (file.size === 0) {
            showStatus("File PDF kosong.", "warning");
            fileInput.value = "";
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            showStatus("Ukuran file melebihi batas 25 MB.", "warning");
            fileInput.value = "";
            return;
        }

        const validMimeType =
            file.type === PDF_MIME_TYPE || file.type === "";

        if (!/\.pdf$/i.test(file.name) || !validMimeType) {
            showStatus("Pilih file dengan format PDF.", "warning");
            fileInput.value = "";
            return;
        }

        const pdfLib = getPdfLib();

        if (!pdfLib) {
            showStatus(
                "Library PDF gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.",
                "danger"
            );
            return;
        }

        isReading = true;
        sourceFile = null;
        originalBytes = null;
        pdfDocument = null;
        originalMetadata = null;

        infoSection.classList.add("d-none");
        clearStatus();
        updateSummary();

        showStatus("Sedang membaca dokumen PDF...", "info");

        try {
            originalBytes = await file.arrayBuffer();

            pdfDocument = await pdfLib.PDFDocument.load(originalBytes);

            sourceFile = file;
            originalMetadata = readMetadata();

            populateMetadata(originalMetadata);

            setText(fileNameElement, file.name);
            setText(pageCountElement, `${pdfDocument.getPageCount()} halaman`);
            setText(fileSizeElement, formatFileSize(file.size));
            setText(versionElement, "Versi PDF: tidak tersedia");

            setText(technicalPageCount, String(pdfDocument.getPageCount()));
            setText(technicalFileSize, formatFileSize(file.size));

            setText(summaryPageCount, String(pdfDocument.getPageCount()));

            outputFilename.value = file.name
                .replace(/\.pdf$/i, "")
                .slice(0, 100) || "edited-document";

            resetTechnicalInformation();
            updateRawMetadata();

            infoSection.classList.remove("d-none");

            showStatus(
                "PDF berhasil dibaca. Metadata standar siap diperiksa dan diedit.",
                "success"
            );
        } catch (error) {
            console.error("PDF metadata read error:", error);

            sourceFile = null;
            originalBytes = null;
            pdfDocument = null;
            originalMetadata = null;

            infoSection.classList.add("d-none");

            showStatus(
                "PDF tidak dapat dibaca. File mungkin rusak, terenkripsi, atau menggunakan struktur yang tidak didukung.",
                "danger"
            );
        } finally {
            isReading = false;
            updateRawMetadata();
            updateSummary();
        }
    }

    function updateMetadataView() {
        if (!pdfDocument) {
            return;
        }

        updateRawMetadata();
        updateSummary();
    }

    async function copyJson() {
        if (!pdfDocument || !jsonMetadata.value) {
            return;
        }

        try {
            await navigator.clipboard.writeText(jsonMetadata.value);

            showStatus("JSON berhasil disalin ke clipboard.", "success");
        } catch (error) {
            console.warn("Clipboard API unavailable:", error);

            jsonMetadata.focus();
            jsonMetadata.select();

            let copied = false;

            try {
                copied = document.execCommand("copy");
            } catch {
                copied = false;
            }

            showStatus(
                copied
                    ? "JSON berhasil disalin ke clipboard."
                    : "Gagal menyalin otomatis. Pilih dan salin JSON secara manual.",
                copied ? "success" : "warning"
            );
        }
    }

    async function saveMetadata(event) {
        event.preventDefault();

        if (isSaving || isReading) {
            return;
        }

        if (!sourceFile || !originalBytes || !pdfDocument) {
            showStatus("Pilih file PDF terlebih dahulu.", "warning");
            return;
        }

        const pdfLib = getPdfLib();

        if (!pdfLib) {
            showStatus("Library PDF tidak tersedia.", "danger");
            return;
        }

        const values = getFormValues();

        if (
            values.creationDate &&
            !parsePdfDate(values.creationDate)
        ) {
            showStatus("Format tanggal dibuat tidak valid.", "warning");
            metadataFields.creationDate.focus();
            return;
        }

        if (
            values.modificationDate &&
            !parsePdfDate(values.modificationDate)
        ) {
            showStatus("Format tanggal modifikasi tidak valid.", "warning");
            metadataFields.modificationDate.focus();
            return;
        }

        isSaving = true;
        updateSummary();

        const originalButtonContent = saveButton.innerHTML;
        saveButton.textContent = "Memproses PDF...";

        showStatus("Sedang menerapkan perubahan metadata...", "info");

        try {
            const outputDocument = await pdfLib.PDFDocument.load(
                originalBytes.slice(0)
            );

            // Field teks yang dikosongkan dihapus dari metadata standar.
            // Kata kunci ditangani sebagai daftar string.
            outputDocument.setTitle(values.title);
            outputDocument.setAuthor(values.author);
            outputDocument.setSubject(values.subject);
            outputDocument.setKeywords(values.keywords);
            outputDocument.setCreator(values.creator);
            outputDocument.setProducer(values.producer);

            const creationDate = values.creationDate
                ? parsePdfDate(values.creationDate)
                : null;

            if (creationDate) {
                outputDocument.setCreationDate(creationDate);
            }

            const modificationDate = values.modificationDate
                ? parsePdfDate(values.modificationDate)
                : new Date();

            outputDocument.setModificationDate(modificationDate);

            const outputBytes = await outputDocument.save();

            const blob = new Blob(
                [outputBytes],
                { type: PDF_MIME_TYPE }
            );

            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = downloadUrl;
            link.download = getOutputName();
            link.style.display = "none";

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 1000);

            showStatus(
                "Metadata berhasil diterapkan ke salinan PDF. Unduhan dimulai.",
                "success"
            );
        } catch (error) {
            console.error("PDF metadata save error:", error);

            showStatus(
                "Gagal menyimpan metadata. Pastikan PDF valid dan fitur dokumen didukung oleh library.",
                "danger"
            );
        } finally {
            isSaving = false;
            saveButton.innerHTML = originalButtonContent;
            refreshIcons();
            updateSummary();
        }
    }

    function resetAll() {
        if (isReading || isSaving) {
            return;
        }

        sourceFile = null;
        originalBytes = null;
        pdfDocument = null;
        originalMetadata = null;

        form.reset();

        fileInput.value = "";
        outputFilename.value = "edited-document";

        infoSection.classList.add("d-none");

        if (rawMetadata) {
            rawMetadata.value = "";
        }

        if (xmpMetadata) {
            xmpMetadata.value = "";
        }

        jsonMetadata.value = "";

        setText(summaryPageCount, "-");
        setText(summaryMetadataCount, "0 field");
        setText(summaryChanges, "Belum ada");
        setText(summaryReadyStatus, "Belum siap");

        setText(technicalPageCount, "-");
        setText(technicalFileSize, "-");

        resetTechnicalInformation();
        clearStatus();
        updateSummary();
    }

    fileInput.addEventListener("change", event => {
        loadPdf(event.target.files?.[0]);
    });

    for (const field of Object.values(metadataFields)) {
        field.addEventListener("input", updateMetadataView);
    }

    form.addEventListener("submit", saveMetadata);
    copyJsonButton?.addEventListener("click", copyJson);
    resetButton.addEventListener("click", resetAll);

    resetTechnicalInformation();
    updateSummary();
    refreshIcons();
})();