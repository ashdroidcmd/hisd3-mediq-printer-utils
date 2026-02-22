# EPSON TM-T82II Printer Integration Guide

## Overview

This guide explains how to set up and use the EPSON TM-T82II thermal printer with the Medique Kiosk system.

## Architecture

The printing system consists of three parts:

1. **Frontend Service** (`printer-service.ts`) - Generates ESC/POS commands
2. **Frontend Hook** (`usePrinter.ts`) - React hook for managing print state
3. **Backend Server** (`print-server.js`) - Node.js service that handles USB/Network printing

## Setup Instructions

### Option 1: Using Print Server (Recommended)

#### Prerequisites

- Node.js 14+ installed
- EPSON TM-T82II printer connected via USB or Network

#### Step 1: Install Print Server Dependencies

```bash
cd src/features/kiosk/utils
npm install express cors body-parser node-thermal-printer
```

#### Step 2: Configure Print Server

Set up environment variables in your `.env` file:

```env
VITE_PRINT_SERVER_URL=http://localhost:3001/print
PRINT_SERVER_PORT=3001
PRINT_SERVER_HOST=localhost
```

#### Step 3: Start the Print Server

```bash
node src/features/kiosk/utils/print-server.js
```

You should see:

```
╔════════════════════════════════════════╗
║   EPSON TM-T82II Print Server         ║
║   Running on http://localhost:3001     ║
╚════════════════════════════════════════╝
```

#### Step 4: Test Printer Connection

```bash
curl -X POST http://localhost:3001/test-print \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "EPSON TM-T82II",
    "address": null
  }'
```

### Option 2: Network Printer Setup

If your printer is connected via Ethernet:

```bash
curl -X POST http://localhost:3001/test-print \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "EPSON TM-T82II",
    "address": "192.168.1.100",
    "port": 9100
  }'
```

Replace `192.168.1.100` with your printer's IP address.

## Usage in Kiosk

### Automatic Printing

When a queue ticket is generated, the system attempts to print automatically.

### Manual Printing

Users can click the "🖨️ Print Ticket" button to reprint the ticket if the automatic print fails.

### Error Handling

If printing fails, an error alert displays with troubleshooting information.

## API Endpoints

### Health Check

```bash
GET /health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-02-20T10:00:00.000Z",
  "connectedPrinters": ["default"]
}
```

### Print Ticket

```bash
POST /print
Content-Type: application/json

{
  "printerName": "EPSON TM-T82II",
  "queueNumber": "Q-001",
  "departmentName": "Cardiology",
  "serviceName": "Consultation",
  "priorityName": "Emergency",
  "address": null,
  "port": 9100
}
```

### Test Print

```bash
POST /test-print
Content-Type: application/json

{
  "printerName": "EPSON TM-T82II",
  "address": null
}
```

## Printer Configuration

### EPSON TM-T82II Default Settings

- **Connection**: USB or Ethernet (9100)
- **Paper Width**: 80mm
- **Max Characters**: 42 per line
- **Character Set**: PC852 Latin-2
- **Print Speed**: Up to 150mm/s

### Changing Settings

Edit `printer-service.ts`:

```typescript
export const printerService = new EpsonPrinterService({
  paperWidth: 80, // Change to 58 for smaller paper
  maxChars: 42, // Auto-calculated based on font
})
```

## Troubleshooting

### Printer Not Detected

1. Check USB connection
2. Verify permissions: Linux users may need `sudo` or add themselves to `dialout` group
3. On Windows: Install EPSON printer drivers
4. On macOS: Install EPSON driver from Apple Software Update

### "Port Already in Use"

If port 3001 is already in use:

```bash
PORT=3002 node src/features/kiosk/utils/print-server.js
```

Then update `VITE_PRINT_SERVER_URL` to `http://localhost:3002/print`

### Network Printer Not Found

1. Verify printer IP: Print configuration page from printer menu
2. Ensure printer is on same network as server
3. Check firewall allows port 9100
4. Test connectivity: `ping 192.168.1.100`

### ESC/POS Commands Not Supported

Some updates to TM-T82II may require driver updates. Check EPSON website for latest drivers.

## Production Deployment

### For Web Deployment

1. Run print server on a dedicated machine/server connected to the printer
2. Update `VITE_PRINT_SERVER_URL` to point to server URL
3. Ensure firewall allows access to print server port
4. Add authentication if needed:

```typescript
// In print-server.js
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token !== process.env.PRINT_SERVER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})
```

### For Desktop/Electron App

For Electron apps, you can use USB communication directly:

```typescript
// Use electron-printer instead
const electronPrinter = require('electron-printer')
electronPrinter.print(printerName, data)
```

## React Component Integration

### Using the Print Hook

```typescript
import { usePrinter } from '@/features/kiosk/hooks/usePrinter'

function MyComponent() {
  const { printing, error, printTicket, clearError } = usePrinter({
    serverUrl: 'http://localhost:3001/print'
  })

  const handlePrint = async () => {
    try {
      await printTicket({
        queueNumber: 'Q-001',
        departmentName: 'Cardiology',
        serviceName: 'Consultation',
        priorityName: 'Emergency',
      })
    } catch (err) {
      console.error('Print failed:', err)
    }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <button onClick={handlePrint} disabled={printing}>
        {printing ? 'Printing...' : 'Print'}
      </button>
    </>
  )
}
```

## Performance Notes

- **Print Time**: ~5-8 seconds per ticket
- **Server Response Time**: ~2-3 seconds
- **Concurrent Prints**: Server handles multiple print jobs sequentially
- **Queue**: Prints are not queued; subsequent prints override pending ones

## Security Considerations

1. Keep print server URL private
2. Use HTTPS for network transmission
3. Validate all input on server side
4. Implement rate limiting:

```typescript
const rateLimit = require('express-rate-limit')
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
})
app.post('/print', limiter, (req, res) => {
  /* ... */
})
```

## File Structure

```
src/features/kiosk/
├── utils/
│   ├── printer-service.ts      # ESC/POS command generation
│   └── print-server.js          # Backend print server
├── hooks/
│   └── usePrinter.ts            # React hook for printing
├── components/
│   └── TicketGenerated.tsx       # Component with print button
└── README.md                    # This file
```

## Support

For issues with the EPSON TM-T82II printer:

1. Check [EPSON TM-T82II Manual](https://www.epson.com/cgi-bin/Store/support/downloads/dlSearch.jsp)
2. Verify ESC/POS command compatibility
3. Update printer firmware if available
4. Contact EPSON support

## License

This integration is part of the Medique HIS project.
