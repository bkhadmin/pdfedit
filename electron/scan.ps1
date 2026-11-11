# Scan with Windows WIA; run by electron/main.cjs (script on stdin, output folder in $env:PDFEDIT_SCAN_DIR).
# The driver's own dialogs pick the device and settings; a feeder scan repeats until the tray is empty.
# Prints one "PAGE<tab>file<tab>dpi" line per page, or "ERR<tab>hresult<tab>message" on failure; cancel prints nothing.
$ErrorActionPreference = 'Stop'
$JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
$PNG = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'
function Hr($e) { $x = $e.Exception; while ($x.InnerException) { $x = $x.InnerException }; '{0:X8}' -f $x.HResult }
try {
  # Invisible topmost window shown first: Electron starts us hidden (windowsHide), which would otherwise hide the
  # first WIA dialog, and the dialogs open in front of the app because this window is active and on top.
  Add-Type -AssemblyName System.Windows.Forms
  $owner = New-Object Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; FormBorderStyle = 'None'; Opacity = 0; StartPosition = 'Manual'; Location = '-200,-200'; Size = '1,1' }
  $owner.Show(); $owner.Activate()
  $dlg = New-Object -ComObject WIA.CommonDialog
  $dev = $dlg.ShowSelectDevice(1, $false, $false) # 1 = scanner; picks the only one without asking
  if ($dev) { $items = $dlg.ShowSelectItems($dev, 0, 0, $true, $true, $false) }
  if ($items) {
    $item = $items.Item(1)
    $feeder = $false # Document Handling Select (3088) bit 1 = feeder; set on the device (WIA 1) or the item (WIA 2)
    foreach ($p in @($dev.Properties) + @($item.Properties)) { if ($p.PropertyID -eq 3088 -and ($p.Value -band 1)) { $feeder = $true } }
    for ($n = 1; $n -le 500; $n++) {
      try { $img = $dlg.ShowTransfer($item, $JPEG, $false) }
      catch { if ($n -gt 1 -and (Hr $_) -eq '80210003') { break }; throw } # 80210003 = feeder empty after the last page
      if (!$img) { break }
      $dpi = $img.HorizontalResolution
      if ($img.FormatID -ne $JPEG -and $img.FormatID -ne $PNG) { # driver ignored the JPEG request (BMP/TIFF): convert
        $ip = New-Object -ComObject WIA.ImageProcess
        $ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
        $ip.Filters.Item(1).Properties.Item('FormatID').Value = $JPEG
        $ip.Filters.Item(1).Properties.Item('Quality').Value = 90
        $img = $ip.Apply($img)
      }
      $f = Join-Path $env:PDFEDIT_SCAN_DIR ("$n." + $img.FileExtension)
      $img.SaveFile($f)
      "PAGE`t$f`t$dpi"
      if (!$feeder) { break }
    }
  }
} catch { "ERR`t" + (Hr $_) + "`t" + $_.Exception.Message }
