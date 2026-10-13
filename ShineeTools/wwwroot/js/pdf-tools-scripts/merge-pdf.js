(() => {
    "use strict";

    const MAX_FILES = 20;
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    const PDF_MIME_TYPE = "application/pdf";

    const form = document.getElementById("mergePdfForm");
    const fileInput = document.getElementById("pdfFiles");
    const statusElement = document.getElementById("pdfStatus");
    const listSection = document.getElementById("pdfListSection");
    const pdfList = document.getElementById("pdfList");

    const outputFilename = document.getElementById("outputFilename");
    const pdfCount = document.getElementById("pdfCount");
    const pdfTotalSize = document.getElementById("pdfTotalSize");
    const pdfReadyStatus = document.getElementById("pdfReadyStatus");

    const mergeButton = document.getElementById("mergePdfs");
    const clearButton = document.getElementById("clearPdfs");
    const resetButton = document.getElementById("resetMerge");

    if (
        !form ||
        !fileInput ||
        !pdfList ||
        !mergeButton ||
        !outputFilename
    ) {
        return;
    }

    let files = [];
    let isMerging = false;

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
        if (!statusElement) {
            return;
        }

        const allowedTypes = ["info", "success", "warning", "danger"];
        const alertType = allowedTypes.includes(type) ? type : "info";

        statusElement.className = `alert alert-${alertType} mt-3 mb-0`;
        statusElement.textContent = message;
    }

    function clearStatus() {
        if (!statusElement) {
            return;
        }

        statusElement.textContent = "";
        statusElement.className = "alert d-none mt-3 mb-0";
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function getTotalSize() {
        return files.reduce((total, file) => total + file.size, 0);
    }

    function getOutputName() {
        const rawName = outputFilename.value.trim() || "merged-document";

        const safeName = rawName
            .replace(/\.pdf$/i, "")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
            .replace(/[. ]+$/g, "")
            .trim();

        return `${safeName || "merged-document"}.pdf`;
    }

    function updateSummary() {
        const count = files.length;
        const totalSize = getTotalSize();

        pdfCount.textContent = `${count} file`;
        pdfTotalSize.textContent = formatFileSize(totalSize);

        if (pdfReadyStatus) {
            if (count < 2) {
                pdfReadyStatus.textContent = "Minimal 2 file";
            } else {
                pdfReadyStatus.textContent = "Siap digabungkan";
            }
        }

        mergeButton.disabled = isMerging || count < 2;

        if (clearButton) {
            clearButton.disabled = isMerging || count === 0;
        }

        if (resetButton) {
            resetButton.disabled = isMerging;
        }

        fileInput.disabled = isMerging;
        outputFilename.disabled = isMerging;

        if (listSection) {
            listSection.classList.toggle("d-none", count === 0);
        }
    }

    function renderFiles() {
        pdfList.replaceChildren();

        files.forEach((file, index) => {
            const item = document.createElement("div");
            item.className =
                "border rounded p-3 d-flex align-items-center gap-3";

            const fileIcon = document.createElement("div");
            fileIcon.className =
                "flex-shrink-0 d-flex align-items-center justify-content-center bg-body-secondary rounded p-2";

            const icon = document.createElement("i");
            icon.setAttribute("data-lucide", "file-text");
            icon.style.width = "22px";
            icon.style.height = "22px";

            fileIcon.appendChild(icon);

            const details = document.createElement("div");
            details.className = "flex-grow-1 min-w-0";

            const name = document.createElement("div");
            name.className = "fw-medium text-break";
            name.textContent = file.name;

            const metadata = document.createElement("div");
            metadata.className = "small text-secondary";
            metadata.textContent =
                `Dokumen ${index + 1} · ${formatFileSize(file.size)}`;

            details.append(name, metadata);

            const actions = document.createElement("div");
            actions.className = "d-flex flex-shrink-0 gap-1";

            const moveUpButton = document.createElement("button");
            moveUpButton.type = "button";
            moveUpButton.className = "btn btn-sm btn-outline-secondary";
            moveUpButton.disabled = isMerging || index === 0;
            moveUpButton.setAttribute("aria-label", `Pindahkan ${file.name} ke atas`);
            moveUpButton.title = "Pindahkan ke atas";

            const upIcon = document.createElement("i");
            upIcon.setAttribute("data-lucide", "arrow-up");
            upIcon.style.width = "16px";
            upIcon.style.height = "16px";
            moveUpButton.appendChild(upIcon);

            moveUpButton.addEventListener("click", () => {
                if (isMerging || index === 0) {
                    return;
                }

                [files[index - 1], files[index]] =
                    [files[index], files[index - 1]];

                clearStatus();
                renderFiles();
            });

            const moveDownButton = document.createElement("button");
            moveDownButton.type = "button";
            moveDownButton.className = "btn btn-sm btn-outline-secondary";
            moveDownButton.disabled =
                isMerging || index === files.length - 1;
            moveDownButton.setAttribute(
                "aria-label",
                `Pindahkan ${file.name} ke bawah`
            );
            moveDownButton.title = "Pindahkan ke bawah";

            const downIcon = document.createElement("i");
            downIcon.setAttribute("data-lucide", "arrow-down");
            downIcon.style.width = "16px";
            downIcon.style.height = "16px";
            moveDownButton.appendChild(downIcon);

            moveDownButton.addEventListener("click", () => {
                if (isMerging || index === files.length - 1) {
                    return;
                }

                [files[index], files[index + 1]] =
                    [files[index + 1], files[index]];

                clearStatus();
                renderFiles();
            });

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "btn btn-sm btn-outline-danger";
            removeButton.disabled = isMerging;
            removeButton.setAttribute(
                "aria-label",
                `Hapus ${file.name}`
            );
            removeButton.title = "Hapus file";

            const removeIcon = document.createElement("i");
            removeIcon.setAttribute("data-lucide", "x");
            removeIcon.style.width = "16px";
            removeIcon.style.height = "16px";
            removeButton.appendChild(removeIcon);

            removeButton.addEventListener("click", () => {
                if (isMerging) {
                    return;
                }

                files.splice(index, 1);
                clearStatus();
                renderFiles();
            });

            actions.append(
                moveUpButton,
                moveDownButton,
                removeButton
            );

            item.append(fileIcon, details, actions);
            pdfList.appendChild(item);
        });

        updateSummary();
        refreshIcons();
    }

    function isDuplicate(candidate) {
        return files.some(file =>
            file.name === candidate.name &&
            file.size === candidate.size &&
            file.lastModified === candidate.lastModified
        );
    }

    function addFiles(fileList) {
        if (isMerging) {
            return;
        }

        const selectedFiles = Array.from(fileList);
        let addedCount = 0;
        let duplicateCount = 0;
        const errors = [];

        for (const file of selectedFiles) {
            if (files.length >= MAX_FILES) {
                errors.push(`Maksimal ${MAX_FILES} file PDF.`);
                break;
            }

            const isPdfByName = /\.pdf$/i.test(file.name);
            const isPdfByType =
                file.type === PDF_MIME_TYPE || file.type === "";

            if (!isPdfByName || !isPdfByType) {
                errors.push(`${file.name}: format file bukan PDF.`);
                continue;
            }

            if (file.size === 0) {
                errors.push(`${file.name}: file kosong.`);
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                errors.push(`${file.name}: ukuran melebihi 25 MB.`);
                continue;
            }

            if (isDuplicate(file)) {
                duplicateCount++;
                continue;
            }

            files.push(file);
            addedCount++;
        }

        fileInput.value = "";
        renderFiles();

        if (errors.length > 0) {
            const message = errors.slice(0, 3).join(" ");

            showStatus(
                `${message}${errors.length > 3 ? " Beberapa file lainnya juga tidak dapat ditambahkan." : ""}`,
                "warning"
            );
        } else if (duplicateCount > 0) {
            showStatus(
                `${addedCount} file ditambahkan. ${duplicateCount} file duplikat dilewati.`,
                "info"
            );
        } else if (addedCount > 0) {
            showStatus(
                `${addedCount} file PDF berhasil ditambahkan.`,
                "success"
            );
        }

        if (files.length > 0) {
            clearButton?.removeAttribute("disabled");
        }
    }

    async function mergePdfs() {
        if (isMerging) {
            return;
        }

        if (files.length < 2) {
            showStatus(
                "Pilih minimal dua file PDF untuk digabungkan.",
                "warning"
            );
            return;
        }

        if (!window.PDFLib?.PDFDocument) {
            showStatus(
                "Library PDF gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.",
                "danger"
            );
            return;
        }

        isMerging = true;
        clearStatus();
        renderFiles();

        const originalButtonContent = mergeButton.innerHTML;
        mergeButton.disabled = true;
        mergeButton.textContent = "Memproses PDF...";

        try {
            const { PDFDocument } = window.PDFLib;
            const mergedPdf = await PDFDocument.create();

            for (let index = 0; index < files.length; index++) {
                const file = files[index];

                showStatus(
                    `Memproses dokumen ${index + 1} dari ${files.length}: ${file.name}`,
                    "info"
                );

                const bytes = await file.arrayBuffer();
                const sourcePdf = await PDFDocument.load(bytes);
                const pageIndices = sourcePdf.getPageIndices();

                if (pageIndices.length === 0) {
                    throw new Error(
                        `${file.name} tidak memiliki halaman PDF.`
                    );
                }

                const copiedPages = await mergedPdf.copyPages(
                    sourcePdf,
                    pageIndices
                );

                for (const page of copiedPages) {
                    mergedPdf.addPage(page);
                }
            }

            showStatus(
                "Menyusun dokumen PDF hasil gabungan...",
                "info"
            );

            const mergedBytes = await mergedPdf.save();
            const blob = new Blob(
                [mergedBytes],
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
                `Berhasil menggabungkan ${files.length} file PDF. Unduhan dimulai.`,
                "success"
            );
        } catch (error) {
            console.error("Merge PDF error:", error);

            showStatus(
                error instanceof Error
                    ? `Gagal menggabungkan PDF: ${error.message}`
                    : "Terjadi kesalahan saat menggabungkan PDF. Pastikan semua file valid dan tidak rusak.",
                "danger"
            );
        } finally {
            isMerging = false;
            mergeButton.innerHTML = originalButtonContent;
            renderFiles();
        }
    }

    function resetAll() {
        if (isMerging) {
            return;
        }

        files = [];
        fileInput.value = "";
        outputFilename.value = "merged-document";

        clearStatus();
        renderFiles();
    }

    fileInput.addEventListener("change", event => {
        addFiles(event.target.files);
    });

    form.addEventListener("submit", event => {
        event.preventDefault();
        mergePdfs();
    });

    clearButton?.addEventListener("click", () => {
        if (isMerging) {
            return;
        }

        files = [];
        fileInput.value = "";

        clearStatus();
        renderFiles();
    });

    resetButton?.addEventListener("click", resetAll);

    renderFiles();
})();