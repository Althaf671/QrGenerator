// Interface untuk abstraction QR Code generator

namespace QrGenerator.Services;

/// <summary>
/// Interface dibuat untuk diimplementasikan oleh QrCodeGenerator
/// </summary>
public interface IQrCodeGenerator
{
    public byte[] Generate(string urlContent);
}