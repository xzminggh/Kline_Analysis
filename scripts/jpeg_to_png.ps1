Add-Type -AssemblyName System.Drawing

$files = @(
  @{ src = 'assets\icon_temp.jpeg'; dst = 'assets\icon.png'; size = 1024 },
  @{ src = 'assets\icon_temp.jpeg'; dst = 'assets\adaptive-icon.png'; size = 1024 },
  @{ src = 'assets\icon_temp.jpeg'; dst = 'assets\splash.png'; size = 1024 }
)

foreach ($f in $files) {
  if (Test-Path $f.src) {
    $srcImg = [System.Drawing.Image]::FromFile((Resolve-Path $f.src).Path)
    $bmp = New-Object System.Drawing.Bitmap($f.size, $f.size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(10, 10, 15))
    $srcRect = New-Object System.Drawing.RectangleF(0, 0, $srcImg.Width, $srcImg.Height)
    $dstRect = New-Object System.Drawing.RectangleF(0, 0, $f.size, $f.size)
    $g.DrawImage($srcImg, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $bmp.Save($f.dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $srcImg.Dispose()
    Write-Host "Converted $($f.src) -> $($f.dst) ($($f.size)x$($f.size))"

    $bytes = [System.IO.File]::ReadAllBytes($f.dst)[0..7]
    $hex = ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
    Write-Host "  new header: $hex"
  } else {
    Write-Host "Source not found: $($f.src)"
  }
}
