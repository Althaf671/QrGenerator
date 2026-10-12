using QRCoder;
using SkiaSharp;
using ShineeTools.Core.Enums;
using ShineeTools.Core.Models;

namespace ShineeTools.Core.Services;

internal sealed class QrCodeGenerator : IQrCodeGenerator
{
    private const int ModuleSize = 20;
    private const int QuietZone = 4;
    private const float LogoSizeRatio = 0.18f;
    private const float LogoPaddingRatio = 0.04f;

    public byte[] Generate(QrCodeRequest request)
    {
        using var generator = new QRCodeGenerator();

        using var data = generator.CreateQrCode(
            request.Url,
            QRCodeGenerator.ECCLevel.H);

        var png = request.Style switch
        {
            QrCodeStyle.Square => GenerateSquare(data),
            QrCodeStyle.Rounded => GenerateStyled(data),
            _ => GenerateSquare(data)
        };

        if (request.Logo is null || request.Logo.Length == 0)
            return png;

        return AddLogo(png, request.Logo);
    }

    private static byte[] GenerateSquare(QRCodeData data)
    {
        var qrCode = new PngByteQRCode(data);
        return qrCode.GetGraphic(ModuleSize);
    }

    private static byte[] GenerateStyled(QRCodeData data)
    {
        var matrix = data.ModuleMatrix;
        var count = matrix.Count;
        var dimension = (count + QuietZone * 2) * ModuleSize;

        using var surface = SKSurface.Create(
            new SKImageInfo(dimension, dimension));

        var canvas = surface.Canvas;
        canvas.Clear(SKColors.White);

        using var paint = new SKPaint
        {
            Color = SKColors.Black,
            IsAntialias = true,
            Style = SKPaintStyle.Fill
        };

        for (var y = 0; y < count; y++)
        {
            for (var x = 0; x < count; x++)
            {
                if (!matrix[y][x] || IsFinderArea(x, y, count))
                    continue;

                var inset = ModuleSize * 0.04f;

                var rect = new SKRect(
                    (x + QuietZone) * ModuleSize + inset,
                    (y + QuietZone) * ModuleSize + inset,
                    (x + QuietZone + 1) * ModuleSize - inset,
                    (y + QuietZone + 1) * ModuleSize - inset);

                canvas.DrawRoundRect(
                    rect,
                    ModuleSize * 0.22f,
                    ModuleSize * 0.22f,
                    paint);
            }
        }

        DrawFinderPattern(canvas, paint, QuietZone, QuietZone);
        DrawFinderPattern(canvas, paint, count - 7 + QuietZone, QuietZone);
        DrawFinderPattern(canvas, paint, QuietZone, count - 7 + QuietZone);

        using var image = surface.Snapshot();
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 100);

        return encoded.ToArray();
    }

    private static byte[] AddLogo(
        byte[] qrPng,
        IFormFile logo)
    {
        using var qrBitmap = SKBitmap.Decode(qrPng) ?? throw new InvalidOperationException(
                "QR Code gagal didekode.");
                
        using var logoStream = logo.OpenReadStream();
        
        using var logoBitmap = SKBitmap.Decode(logoStream) ?? throw new InvalidOperationException(
                "Logo gagal didekode oleh SkiaSharp.");

        using var surface = SKSurface.Create(
            new SKImageInfo(qrBitmap.Width, qrBitmap.Height));

        var canvas = surface.Canvas;
        canvas.Clear(SKColors.White);
        canvas.DrawBitmap(
            qrBitmap,
            new SKPoint(0, 0),
            new SKSamplingOptions(SKFilterMode.Nearest, SKMipmapMode.None));

        var logoSize = qrBitmap.Width * LogoSizeRatio;
        var padding = qrBitmap.Width * LogoPaddingRatio;
        var boxSize = logoSize + padding * 2;

        var centerX = qrBitmap.Width / 2f;
        var centerY = qrBitmap.Height / 2f;

        var background = new SKRect(
            centerX - boxSize / 2f,
            centerY - boxSize / 2f,
            centerX + boxSize / 2f,
            centerY + boxSize / 2f);

        using var backgroundPaint = new SKPaint
        {
            Color = SKColors.White,
            IsAntialias = true,
            Style = SKPaintStyle.Fill
        };

        canvas.DrawRoundRect(
            background,
            boxSize * 0.12f,
            boxSize * 0.12f,
            backgroundPaint);

        var logoRect = new SKRect(
            centerX - logoSize / 2f,
            centerY - logoSize / 2f,
            centerX + logoSize / 2f,
            centerY + logoSize / 2f);

        var scale = Math.Min(
            logoSize / logoBitmap.Width,
            logoSize / logoBitmap.Height);

        var width = logoBitmap.Width * scale;
        var height = logoBitmap.Height * scale;

        var fittedLogo = new SKRect(
            centerX - width / 2f,
            centerY - height / 2f,
            centerX + width / 2f,
            centerY + height / 2f);

        using var logoPaint = new SKPaint
        {
            IsAntialias = true
        };

        canvas.DrawBitmap(
            logoBitmap,
            fittedLogo,
            new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.None),
            logoPaint);

        using var image = surface.Snapshot();
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 100);

        return encoded.ToArray();
    }

    private static bool IsFinderArea(int x, int y, int count)
    {
        return (x < 7 && y < 7)
            || (x >= count - 7 && y < 7)
            || (x < 7 && y >= count - 7);
    }

    private static void DrawFinderPattern(
        SKCanvas canvas,
        SKPaint paint,
        int moduleX,
        int moduleY)
    {
        var left = moduleX * ModuleSize;
        var top = moduleY * ModuleSize;
        var size = 7 * ModuleSize;

        var outer = new SKRect(
            left, top, left + size, top + size);

        canvas.DrawRoundRect(
            outer,
            ModuleSize * 1.15f,
            ModuleSize * 1.15f,
            paint);

        paint.Color = SKColors.White;

        var ringInset = ModuleSize;

        var ring = new SKRect(
            left + ringInset,
            top + ringInset,
            left + size - ringInset,
            top + size - ringInset);

        canvas.DrawRoundRect(
            ring,
            ModuleSize * 0.8f,
            ModuleSize * 0.8f,
            paint);

        paint.Color = SKColors.Black;

        var centerInset = 2 * ModuleSize;

        var center = new SKRect(
            left + centerInset,
            top + centerInset,
            left + size - centerInset,
            top + size - centerInset);

        canvas.DrawRoundRect(
            center,
            ModuleSize * 0.65f,
            ModuleSize * 0.65f,
            paint);
    }
}