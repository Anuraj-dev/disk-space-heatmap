# Starts the app in dev mode. Makes sure the Rust toolchain on D: is on PATH,
# even in terminals opened before Rust was installed.
$env:RUSTUP_HOME = 'D:\DevTools\rustup'
$env:CARGO_HOME = 'D:\DevTools\cargo'
if (-not ($env:Path -split ';' | Where-Object { $_ -eq 'D:\DevTools\cargo\bin' })) {
    $env:Path = "D:\DevTools\cargo\bin;$env:Path"
}
# Windows SDK resource compiler (rc.exe) embeds the app icon; add the newest x64 one.
$rc = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\rc.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
if ($rc) { $env:Path = "$($rc.DirectoryName);$env:Path" }
Set-Location $PSScriptRoot
npm run tauri dev
