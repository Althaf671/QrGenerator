// kita mulai dengan buat HTTP request model

using System.ComponentModel.DataAnnotations;

namespace QrGenerator.Models;

/// <summary>
/// record untuk menampung properti
/// </summary>
public sealed record QrCodeRequest
{
    /// <summary>
    /// Properti Url yang akan menampung input dengan data annotation untuk validasi
    /// </summary>
    [Display(Name = "Masukan URL")]
    [Required(ErrorMessage = "Url tidak boleh kosong.")]
    [StringLength(2048, ErrorMessage = "Url terlalu panjang.")]
    public string Url { get; set; } = string.Empty;
}