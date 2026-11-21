# Jalankan viewer tata ruang Kabupaten Banjarnegara
#
#   .\serve.ps1                -> port 8080 (atau kandidat berikutnya bila terpakai)
#   .\serve.ps1 -Port 8008     -> pakai 8008
#   .\serve.ps1 -NoBrowser     -> jangan buka browser
#
# Hentikan dengan Ctrl+C.
#
# Kenapa perlu server: browser memblokir fetch() GeoJSON pada protokol file://.
#
# Cara kerja pemilihan port: script langsung mencoba MENYALAKAN server pada
# port yang diminta, lalu menunggu sampai halaman benar-benar terlayani. Bila
# gagal, ia pindah ke kandidat berikutnya. Ini lebih andal daripada menebak
# ketersediaan port lebih dulu (Get-NetTCPConnection justru melempar error saat
# port kosong, dan bind bisa gagal sesaat karena socket TIME_WAIT).
#
# URL memakai 127.0.0.1, bukan "localhost", karena di Windows "localhost"
# sering resolve ke IPv6 (::1) sehingga bisa menabrak aplikasi lain.

param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$root = $PSScriptRoot
$halaman = Join-Path $root 'web\index.html'

if (-not (Test-Path $halaman)) {
    Write-Error "Tidak menemukan $halaman. Jalankan script ini dari folder proyek."
    exit 1
}

# ---------- cari python ----------

$python = $null
$kandidatPython = @(
    (Join-Path $root '.venv\Scripts\python.exe'),
    (Join-Path $root '.venv\Scripts\pythonw.exe'),
    'python',
    'py'
)
foreach ($k in $kandidatPython) {
    if ($k -like "$root*" -and (-not (Test-Path $k))) { continue }
    try {
        $test = & $k -c "import http.server; print('OK')" 2>$null
        if ($test -match 'OK') { $python = $k; break }
    } catch { }
}
if (-not $python) {
    Write-Error "Python tidak ditemukan atau tidak dapat dijalankan. Pasang Python, atau sajikan folder $root dengan web server apa pun."
    exit 1
}

# ---------- kandidat port ----------

$kandidat = @($Port) + @(8080, 8008, 8081, 8082, 8090, 3000, 5000, 9000, 7000, 5500) |
    Select-Object -Unique

# ---------- coba nyalakan sampai berhasil ----------

$proc = $null
$port = $null
$url = $null

foreach ($p in $kandidat) {
    Write-Host ""
    Write-Host "  Mencoba port $p..." -NoNewline

    $coba = Start-Process -FilePath $python `
        -ArgumentList '-m', 'http.server', $p, '--bind', '127.0.0.1' `
        -WorkingDirectory $root -PassThru -WindowStyle Hidden

    $siap = $false
    for ($i = 0; $i -lt 24; $i++) {
        Start-Sleep -Milliseconds 250
        if ($coba.HasExited) { break }
        try {
            $r = Invoke-WebRequest "http://127.0.0.1:$p/web/index.html" -UseBasicParsing -TimeoutSec 2
            if ($r.Content -match 'Rencana Tata Ruang') { $siap = $true; break }
        } catch { }
    }

    if ($siap) {
        Write-Host " berhasil" -ForegroundColor Green
        $proc = $coba
        $port = $p
        $url = "http://127.0.0.1:$p/web/"
        break
    }

    Write-Host " gagal" -ForegroundColor DarkYellow
    if (-not $coba.HasExited) { Stop-Process -Id $coba.Id -Force -ErrorAction SilentlyContinue }
}

if (-not $siap) {
    Write-Error "Tidak ada port yang bisa dipakai. Coba: .\serve.ps1 -Port 9123"
    exit 1
}

if ($port -ne $Port) {
    Write-Host ""
    Write-Host "  Port $Port tidak bisa dipakai, memakai $port." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Viewer Tata Ruang Kabupaten Banjarnegara" -ForegroundColor White
Write-Host "  ----------------------------------------"
Write-Host "  Buka di browser : $url" -ForegroundColor Green
Write-Host "  Halaman banding : ${url}banding.html" -ForegroundColor Green
Write-Host "  Akar folder     : $root"
Write-Host "  Python          : $python"
Write-Host "  Hentikan        : Ctrl+C"
Write-Host ""

if (-not $NoBrowser) {
    Start-Process $url
}

try {
    Wait-Process -Id $proc.Id
} finally {
    if (-not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Server dihentikan." -ForegroundColor Yellow
}
