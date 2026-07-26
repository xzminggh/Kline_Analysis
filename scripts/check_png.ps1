$files = @('assets\icon.png','assets\adaptive-icon.png','assets\splash.png','assets\icon_temp.jpeg')
foreach ($f in $files) {
  if (Test-Path $f) {
    $item = Get-Item $f
    $bytes = [System.IO.File]::ReadAllBytes($f)[0..7]
    $hex = ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
    $ascii = -join ($bytes[0..3] | ForEach-Object { if ($_ -ge 32 -and $_ -le 126) { [char]$_ } else { '.' } })
    Write-Host "$($item.Name)  size=$($item.Length)  header=$hex  ascii=$ascii"
  } else {
    Write-Host "$f NOT FOUND"
  }
}
