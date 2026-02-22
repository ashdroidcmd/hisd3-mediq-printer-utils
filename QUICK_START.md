# 🖨️ EPSON TM-T82II Print Server - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Install Dependencies (Windows)

```powershell
cd src\features\kiosk\utils
.\setup.ps1
```

### Step 1: Install Dependencies (Linux/macOS)

```bash
cd src/features/kiosk/utils
bash setup.sh
```

### Step 2: Start Print Server

```bash
npm start
```

The server should print:

```
╔════════════════════════════════════════╗
║   EPSON TM-T82II Print Server         ║
║   Running on http://localhost:3001     ║
╚════════════════════════════════════════╝
```

### Step 3: Test Connection

```bash
# Windows (PowerShell)
$body = @{
    printerName = "EPSON TM-T82II"
    address = $null
} | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:3001/test-print -Method POST -ContentType "application/json" -Body $body

# Linux/macOS
curl -X POST http://localhost:3001/test-print \
  -H "Content-Type: application/json" \
  -d '{"printerName":"EPSON TM-T82II","address":null}'
```

### Step 4: Configure Frontend

Update your `.env` file:

```env
VITE_PRINT_SERVER_URL=http://localhost:3001/print
VITE_AUTO_PRINT_ENABLED=true
```

**Done!** 🎉 Tickets will now print automatically.

---

## 🔧 Common Tasks

### Reprint a Ticket

Click the "🖨️ Print Ticket" button on the ticket generated screen.

### Check Printer Status

```bash
curl http://localhost:3001/health
```

### Change Paper Size (58mm)

Edit `printer-service.ts`:

```typescript
export const printerService = new EpsonPrinterService({
  paperWidth: 58, // Changed from 80
  maxChars: 32, // Adjust accordingly
})
```

### Use Network Printer

Edit print server call:

```json
{
  "printerName": "EPSON TM-T82II",
  "address": "192.168.1.100",
  "port": 9100
}
```

---

## ❌ Troubleshooting

| Issue                       | Solution                                                    |
| --------------------------- | ----------------------------------------------------------- |
| `Port 3001 already in use`  | Run on different port: `PORT=3002 npm start`                |
| `Printer not found`         | Check USB connection, reinstall drivers                     |
| `Print server won't start`  | Ensure Node.js is installed: `node --version`               |
| `Auto-print not working`    | Check browser console for errors, verify server URL in .env |
| `Permission denied (Linux)` | Run `sudo usermod -a -G dialout $USER`                      |

---

## 📚 More Information

- **Full Setup Guide**: See `PRINTER_README.md`
- **API Reference**: See `PRINTER_README.md` → API Endpoints
- **Printer Manual**: [EPSON TM-T82II Manual](https://www.epson.com/cgi-bin/Store/support/downloads/)

---

## 🎯 What Gets Printed

The system prints a formatted receipt containing:

- 🎫 Queue Number (large, centered)
- 🏥 Department Name
- 💼 Service Name
- ⚠️ Priority Level
- ⏰ Timestamp
- �٪ Patient instructions

Paper is automatically cut after printing.

---

## 📞 Support

1. Check `PRINTER_README.md` for detailed troubleshooting
2. Verify print server is running: `curl http://localhost:3001/health`
3. Check browser console for JavaScript errors
4. Review printer event log in Windows or system logs in Linux/macOS

---

**Ready to print!** Start the server and generate your first ticket. 🚀
