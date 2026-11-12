# List scanners; run by electron/main.cjs (script on stdin). Prints "DEV<tab>id<tab>name" per WIA scanner and
# "OFF<tab>name<tab>status" per Image-class PnP device WIA doesn't offer (status OK = TWAIN-only, else offline/absent).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8 # device names may be non-ASCII
try {
  $wia = @{} # lower-case DeviceIDs (= PnP driver key, e.g. {6BDD1FC6-...}\0000) and names of all WIA devices
  foreach ($d in (New-Object -ComObject WIA.DeviceManager).DeviceInfos) {
    $name = '' + $d.Properties.Item('Name').Value
    $wia[$d.DeviceID.ToLower()] = 1; if ($name) { $wia[$name.ToLower()] = 1 }
    if ($d.Type -eq 1) { "DEV`t" + $d.DeviceID + "`t" + $name } # 1 = scanner
  }
  foreach ($p in @(Get-PnpDevice -Class Image -ErrorAction SilentlyContinue)) { # none installed = error, ignored
    $key = '' + ($p | Get-PnpDeviceProperty -KeyName DEVPKEY_Device_Driver).Data
    if (!$wia.ContainsKey($key.ToLower()) -and !$wia.ContainsKey(('' + $p.FriendlyName).ToLower())) { "OFF`t" + $p.FriendlyName + "`t" + $p.Status }
  }
} catch { "ERR`t" + ('{0:X8}' -f $_.Exception.HResult) + "`t" + $_.Exception.Message }
