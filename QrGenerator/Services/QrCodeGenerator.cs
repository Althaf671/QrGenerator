// Program yang akan membuat kode QR

using QRCoder;

namespace QrGenerator.Services;

internal sealed class QrCodeGenerator : IQrCodeGenerator
{
    public byte[] Generate(string urlContent)
    {
        // panggil library
        using var generator = new QRCodeGenerator();

        // buat kode qr
        using var qrCodeData = generator.CreateQrCode(
            urlContent, 
            QRCodeGenerator.ECCLevel.Q);

        // buat qr code jadi PNG
        var qrCode = new PngByteQRCode(qrCodeData);

        return qrCode.GetGraphic(20);
    }
}