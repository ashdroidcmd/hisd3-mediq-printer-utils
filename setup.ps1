# Windows Setup Script for EPSON TM-T82II Print Server
# Run as Administrator: powershell -ExecutionPolicy Bypass -File setup.ps1

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Setting up Print Server               ║" -ForegroundColor Cyan
Write-Host "║  EPSON TM-T82II Thermal Printer       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Get current directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Write-Host "📁 Project directory: $ProjectDir" -ForegroundColor Yellow
Write-Host ""

# Check if Node.js is installed
try {
    $NodeVersion = node --version
    Write-Host "✓ Node.js $NodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    Write-Host "   Please install Node.js 14+ from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "   Then run this script again" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow

Push-Location $ScriptDir

if (Test-Path "package.json") {
    npm install
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  package.json not found, creating one..." -ForegroundColor Yellow
    npm init -y
    npm install express cors body-parser node-thermal-printer
}

Pop-Location

# Create .env file if it doesn't exist
$EnvFile = Join-Path $ProjectDir ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host ""
    Write-Host "📝 Creating .env file..." -ForegroundColor Yellow
    
    $EnvContent = @"
VITE_PRINT_SERVER_URL=http://localhost:3001/print
VITE_PRINT_SERVER_HEALTH_CHECK=http://localhost:3001/health
VITE_PRINTER_NAME=EPSON TM-T82II
VITE_AUTO_PRINT_ENABLED=true
PRINT_SERVER_PORT=3001
PRINT_SERVER_HOST=localhost
"@
    
    Set-Content -Path $EnvFile -Value $EnvContent
    Write-Host "✓ .env file created" -ForegroundColor Green
} else {
    Write-Host "✓ .env file already exists" -ForegroundColor Green
}

# Check for printer drivers
Write-Host ""
Write-Host "🖨️  Printer Setup" -ForegroundColor Yellow
Write-Host ""
Write-Host "   ⚠️  Make sure:" -ForegroundColor Yellow
Write-Host "      1. EPSON TM-T82II printer is connected via USB" -ForegroundColor Gray
Write-Host "      2. EPSON printer drivers are installed" -ForegroundColor Gray
Write-Host "      3. Printer is powered on" -ForegroundColor Gray
Write-Host ""

# Try to find printers
Write-Host "   Scanning for connected printers..." -ForegroundColor Gray
$Printers = Get-PrinterDriver | Where-Object { $_ -like "*EPSON*" }

if ($Printers) {
    Write-Host "   ✓ Found EPSON drivers:" -ForegroundColor Green
    foreach ($Printer in $Printers) {
        Write-Host "      - $Printer" -ForegroundColor Green
    }
} else {
    Write-Host "   ⚠️  No EPSON drivers found" -ForegroundColor Yellow
    Write-Host "      Download from: https://epson.com/Support" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the print server:" -ForegroundColor Cyan
Write-Host "   npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "To test printer connection:" -ForegroundColor Cyan
Write-Host "   npm test" -ForegroundColor Yellow
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  📝 Edit your .env file for printer settings" -ForegroundColor Yellow
Write-Host "  📖 See PRINTER_README.md for detailed setup instructions" -ForegroundColor Yellow
