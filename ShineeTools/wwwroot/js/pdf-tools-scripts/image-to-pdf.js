(() => {
    "use strict";

    const MAX_FILES = 20;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const MAX_IMAGE_DIMENSION = 2400;

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    const form = document.getElementById("imageToPdfForm");
    const fileInput = document.getElementById("imageFiles");
    const imageList = document.getElementById("imageList");
    const previewSection = document.getElementById("imagePreviewSection");
    const imageStatus = document.getElementById("imageStatus");
    const imageCount = document.getElementById("imageCount");
    const paperSize = document.getElementById("paperSize");
    const orientation = document.getElementById("orientation");
    const margin = document.getElementById("margin");
    const paperSummary = document.getElementById("paperSummary");
    const orientationSummary = document.getElementById("orientationSummary");
    const marginSummary = document.getElementById("marginSummary");
    const generateButton = document.getElementById("generatePdf");
    const clearButton = document.getElementById("clearImages");
    const resetButton = document.getElementById("resetForm");

    if (!form || !fileInput || !imageList) {
        return;
    }

    // File yang akan diproses, sesuai urutan tampilannya.
    let images = [];
    let isGenerating = false;

    function formatFileSize(bytes) {
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function showStatus(message, type = "info") {
        imageStatus.textContent = message;
        imageStatus.className = `alert alert-${type} mt-3 mb-0`;
    }

    function clearStatus() {
        imageStatus.textContent = "";
        imageStatus.className = "alert d-none mt-3 mb-0";
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function updateSummary() {
        imageCount.textContent =
            `${images.length} gambar`;

        paperSummary.textContent =
            paperSize.value === "a4" ? "A4" : "Letter";

        orientationSummary.textContent =
            orientation.value === "portrait"
                ? "Portrait"
                : "Landscape";

        marginSummary.textContent =
            `${margin.value} mm`;

        generateButton.disabled =
            images.length === 0 || isGenerating;

        previewSection.classList.toggle(
            "d-none",
            images.length === 0
        );

        clearButton.disabled =
            images.length === 0 || isGenerating;
    }

    function renderImages() {
        imageList.replaceChildren();

        images.forEach((file, index) => {
            const item = document.createElement("div");

            item.className =
                "d-flex align-items-center gap-3 border rounded p-3";

            const preview = document.createElement("img");
            preview.src = URL.createObjectURL(file);
            preview.alt = `Pratinjau ${file.name}`;
            preview.className = "border rounded flex-shrink-0";
            preview.style.width = "64px";
            preview.style.height = "64px";
            preview.style.objectFit = "cover";

            // Simpan URL agar bisa dilepas saat elemen dihapus.
            preview.dataset.previewUrl = preview.src;

            const details = document.createElement("div");
            details.className = "flex-grow-1 text-truncate";

            const name = document.createElement("div");
            name.className = "fw-medium text-truncate";
            name.textContent = file.name;

            const size = document.createElement("small");
            size.className = "text-secondary";
            size.textContent = formatFileSize(file.size);

            details.append(name, size);

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className =
                "btn btn-sm btn-outline-danger flex-shrink-0";
            removeButton.setAttribute(
                "aria-label",
                `Hapus ${file.name}`
            );

            const icon = document.createElement("i");
            icon.setAttribute("data-lucide", "x");
            icon.style.width = "16px";
            icon.style.height = "16px";

            removeButton.append(icon);

            removeButton.addEventListener("click", () => {
                if (isGenerating) return;

                images.splice(index, 1);
                clearStatus();
                renderImages();
            });

            item.append(preview, details, removeButton);
            imageList.append(item);
        });

        updateSummary();
        refreshIcons();
    }

    function addFiles(fileList) {
        if (isGenerating) return;

        clearStatus();

        const selectedFiles = Array.from(fileList);
        const rejected = [];
        let added = 0;

        for (const file of selectedFiles) {
            if (!allowedTypes.includes(file.type)) {
                rejected.push(`${file.name}: format tidak didukung`);
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                rejected.push(`${file.name}: ukuran melebihi 10 MB`);
                continue;
            }

            if (images.length >= MAX_FILES) {
                rejected.push("Maksimal 20 gambar");
                break;
            }

            // Hindari memasukkan file yang sama dua kali.
            const alreadyExists = images.some(existing =>
                existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified
            );

            if (alreadyExists) {
                rejected.push(`${file.name}: sudah ditambahkan`);
                continue;
            }

            images.push(file);
            added++;
        }

        renderImages();

        if (rejected.length > 0) {
            const details = rejected.slice(0, 4).join(". ");
            const extra = rejected.length > 4
                ? ` Dan ${rejected.length - 4} lainnya.`
                : "";

            showStatus(
                `${added} gambar ditambahkan. ${details}${extra}`,
                "warning"
            );
        } else if (added > 0) {
            showStatus(
                `${added} gambar berhasil ditambahkan.`,
                "success"
            );
        }

        // Memungkinkan pengguna memilih ulang file yang sama.
        fileInput.value = "";
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const image = new Image();

            image.onload = () => {
                URL.revokeObjectURL(objectUrl);

                if (!image.naturalWidth || !image.naturalHeight) {
                    reject(new Error(`Gambar tidak valid: ${file.name}`));
                    return;
                }

                resolve(image);
            };

            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error(`Gagal membaca gambar: ${file.name}`));
            };

            image.src = objectUrl;
        });
    }

    async function convertImageToJpeg(file) {
        const image = await loadImage(file);

        const scale = Math.min(
            1,
            MAX_IMAGE_DIMENSION /
                Math.max(image.naturalWidth, image.naturalHeight)
        );

        const canvas = document.createElement("canvas");

        canvas.width = Math.max(
            1,
            Math.round(image.naturalWidth * scale)
        );

        canvas.height = Math.max(
            1,
            Math.round(image.naturalHeight * scale)
        );

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Browser tidak mendukung pemrosesan gambar.");
        }

        // Latar putih membuat transparansi PNG tidak menjadi hitam.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

        return {
            dataUrl,
            width: canvas.width,
            height: canvas.height
        };
    }

    async function generatePdf() {
        if (isGenerating || images.length === 0) return;

        if (!window.jspdf?.jsPDF) {
            showStatus(
                "Library PDF gagal dimuat. Periksa koneksi internet lalu coba lagi.",
                "danger"
            );
            return;
        }

        isGenerating = true;
        generateButton.disabled = true;
        clearButton.disabled = true;
        resetButton.disabled = true;
        fileInput.disabled = true;

        const originalLabel = generateButton.textContent;
        generateButton.textContent = "Memproses gambar...";

        try {
            const { jsPDF } = window.jspdf;

            const pdf = new jsPDF({
                orientation: orientation.value,
                unit: "mm",
                format: paperSize.value,
                compress: true
            });

            const pageMargin = Number(margin.value);

            for (let index = 0; index < images.length; index++) {
                showStatus(
                    `Memproses gambar ${index + 1} dari ${images.length}...`,
                    "info"
                );

                const image = await convertImageToJpeg(images[index]);

                if (index > 0) {
                    pdf.addPage(paperSize.value, orientation.value);
                }

                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();

                const availableWidth = pageWidth - pageMargin * 2;
                const availableHeight = pageHeight - pageMargin * 2;

                if (availableWidth <= 0 || availableHeight <= 0) {
                    throw new Error("Margin tidak sesuai dengan ukuran halaman.");
                }

                // Fit gambar ke halaman tanpa mengubah rasio aspek.
                const scale = Math.min(
                    availableWidth / image.width,
                    availableHeight / image.height
                );

                const width = image.width * scale;
                const height = image.height * scale;

                const x = (pageWidth - width) / 2;
                const y = (pageHeight - height) / 2;

                pdf.addImage(
                    image.dataUrl,
                    "JPEG",
                    x,
                    y,
                    width,
                    height,
                    undefined,
                    "FAST"
                );
            }

            const filenameInput = document.getElementById("outputFilename");

            const filename = (filenameInput?.value.trim() || "images-to-pdf")
                .replace(/\.pdf$/i, "")
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
                .trim();

            pdf.save(`${filename || "images-to-pdf"}.pdf`);

            showStatus(
                `PDF berhasil dibuat dari ${images.length} gambar.`,
                "success"
            );
        } catch (error) {
            console.error("Image to PDF error:", error);

            showStatus(
                error instanceof Error
                    ? error.message
                    : "Terjadi kesalahan saat membuat PDF.",
                "danger"
            );
        } finally {
            isGenerating = false;
            generateButton.textContent = originalLabel;
            fileInput.disabled = false;
            resetButton.disabled = false;

            renderImages();
        }
    }

    function resetAll() {
        if (isGenerating) return;

        images = [];
        fileInput.value = "";
        paperSize.value = "a4";
        orientation.value = "portrait";
        margin.value = "5";

        clearStatus();
        renderImages();
    }

    fileInput.addEventListener("change", () => {
        addFiles(fileInput.files);
    });

    form.addEventListener("submit", event => {
        event.preventDefault();
        generatePdf();
    });

    clearButton.addEventListener("click", () => {
        if (isGenerating) return;

        images = [];
        clearStatus();
        renderImages();
    });

    resetButton.addEventListener("click", resetAll);

    paperSize.addEventListener("change", updateSummary);
    orientation.addEventListener("change", updateSummary);
    margin.addEventListener("change", updateSummary);

    renderImages();
})();