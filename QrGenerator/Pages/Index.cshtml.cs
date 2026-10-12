using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using QrGenerator.Models;
using QrGenerator.Services;

namespace QrGenerator.Pages;

public class IndexModel : PageModel
{
    private readonly IQrCodeGenerator _qrCodeGenerator;

    [BindProperty]
    public QrCodeRequest Input { get; set; } = new(); 
    public string? QrCodeDataUrl { get; private set; }

    public IndexModel(IQrCodeGenerator generator)
        => _qrCodeGenerator = generator; 

    public IActionResult OnPostGenerate()
    {
        // validasi
        if (!ValidateUrl())
            return Page();

        // generator
        var png = _qrCodeGenerator.Generate(Input.Url);
        
        // ubah jadi HTML gambar
        QrCodeDataUrl = $"data:image/png;base64, {Convert.ToBase64String(png)}";

        return Page();
    }

    public IActionResult OnPostDownload()
    {
        // validasi
        if (!ValidateUrl())
            return Page();

        // generator
        var png = _qrCodeGenerator.Generate(Input.Url);

        // download file
        return File(png, "image/png", "qrcode.png");
    }

    public void OnGet()
    {
    }

    // validator
    private bool ValidateUrl()
    {
        if (!ModelState.IsValid)
            return false;

        // buang whitespace depan-belakang
        var val = Input.Url.Trim();

        // mencoba membuat Uri, dengan ketentuan dia harus HTTP/HTTPS saja, dan 
        // bukan string kosong atau null
        // jika hasil TryCreate true berarti uri tidak memenuhi ketentuan di bawah
        // notasi ! membuat blok di eksekusi dan set pesan error dan return false
        if (!Uri.TryCreate(
                val, 
                UriKind.Absolute, 
                out var uri) 
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || string.IsNullOrWhiteSpace(uri.Host))
        {
            ModelState.AddModelError(
                "Input.Url", 
                "Masukan URL yang valid, hanya dengan http atau https.");

            return false;
        }

        // assign nilai input yang udah di trim dan divalidasi ke Input.Url
        // nanti akan diteruskan ke service
        Input.Url = val;
        return true;
    }
}
