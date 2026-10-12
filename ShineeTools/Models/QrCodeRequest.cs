// kita mulai dengan buat HTTP request model

using System.ComponentModel.DataAnnotations;
using ShineeTools.Core.Enums;

namespace ShineeTools.Core.Models;

public sealed record QrCodeRequest
{
    [Display(Name = "Masukan URL")]
    [Required(ErrorMessage = "Url tidak boleh kosong.")]
    [StringLength(2048, ErrorMessage = "Url terlalu panjang.")]
    public string Url { get; set; } = string.Empty;

    [Display(Name = "Style QR Code")]
    [Required(ErrorMessage = "Style harus dipilih.")]
    public QrCodeStyle Style { get; set; } = QrCodeStyle.Square;

    [Display(Name = "Logo di tengah QR Code")]
    public IFormFile? Logo { get; set; }
}