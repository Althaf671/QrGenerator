using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using ShineeTools.Core.Models;
using ShineeTools.Core.Services;
using SkiaSharp;

namespace ShineeTools.Core.Pages.QrGenerator;

public sealed class IndexModel : PageModel
{
    private const long MaxLogoSize = 2 * 1024 * 1024;
    private const int MaxLogoDimension = 4096;

    private static readonly HashSet<string> AllowedLogoExtensions =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp"
        };

    private readonly IQrCodeGenerator _qrCodeGenerator;
    private readonly ILogger<IndexModel> _logger;

    public IndexModel(
        IQrCodeGenerator qrCodeGenerator,
        ILogger<IndexModel> logger)
    {
        _qrCodeGenerator = qrCodeGenerator;
        _logger = logger;
    }

    [BindProperty]
    public QrCodeRequest Input { get; set; } = new();

    public string? QrCodeDataUrl { get; private set; }

    public void OnGet()
    {
    }

    public IActionResult OnPostGenerate()
    {
        if (!ValidateInput())
            return Page();

        try
        {
            var png = _qrCodeGenerator.Generate(Input);

            QrCodeDataUrl =
                $"data:image/png;base64,{Convert.ToBase64String(png)}";

            return Page();
        }
        catch (Exception exception)
        {
            _logger.LogError(
                exception,
                "Gagal membuat QR Code.");

            ModelState.AddModelError(
                string.Empty,
                "QR Code gagal dibuat. Periksa input dan coba lagi.");

            return Page();
        }
    }

    private bool ValidateInput()
    {
        if (!TryValidateModel(Input, nameof(Input)))
            return false;

        return ValidateUrl() && ValidateLogo();
    }

    private bool ValidateUrl()
    {
        var value = Input.Url.Trim();

        if (!Uri.TryCreate(
                value,
                UriKind.Absolute,
                out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp
                && uri.Scheme != Uri.UriSchemeHttps)
            || string.IsNullOrWhiteSpace(uri.Host))
        {
            ModelState.AddModelError(
                "Input.Url",
                "Masukkan URL valid yang menggunakan HTTP atau HTTPS.");

            return false;
        }

        Input.Url = uri.AbsoluteUri;
        return true;
    }

    private bool ValidateLogo()
    {
        var logo = Input.Logo;

        if (logo is null || logo.Length == 0)
            return true;

        if (logo.Length > MaxLogoSize)
        {
            ModelState.AddModelError(
                "Input.Logo",
                "Ukuran logo maksimal 2 MB.");

            return false;
        }

        var extension = Path.GetExtension(logo.FileName);

        if (!AllowedLogoExtensions.Contains(extension))
        {
            ModelState.AddModelError(
                "Input.Logo",
                "Format logo harus PNG, JPG, JPEG, atau WebP.");

            return false;
        }

        try
        {
            using var stream = logo.OpenReadStream();
            using var bitmap = SKBitmap.Decode(stream);

            if (bitmap is null
                || bitmap.Width <= 0
                || bitmap.Height <= 0)
            {
                ModelState.AddModelError(
                    "Input.Logo",
                    "File logo bukan gambar yang valid.");

                return false;
            }

            if (bitmap.Width > MaxLogoDimension
                || bitmap.Height > MaxLogoDimension)
            {
                ModelState.AddModelError(
                    "Input.Logo",
                    "Dimensi logo maksimal 4096 × 4096 piksel.");

                return false;
            }
        }
        catch (Exception exception)
            when (exception is not OutOfMemoryException)
        {
            ModelState.AddModelError(
                "Input.Logo",
                "File logo tidak dapat dibaca.");

            return false;
        }

        return true;
    }
}