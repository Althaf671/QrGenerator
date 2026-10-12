// Interface untuk abstraction QR Code generator

using ShineeTools.Core.Models;

namespace ShineeTools.Core.Services;

/// <summary>
/// Interface dibuat untuk diimplementasikan oleh QrCodeGenerator
/// </summary>
public interface IQrCodeGenerator
{
    public byte[] Generate(QrCodeRequest request);
}