# EPSON TM-T82II Print Server (Windows)

Backend service for the Medique kiosk's queue-ticket printing. The frontend
(`printer-service.ts` / `usePrinter.ts` in `mediq-frontend`) builds ESC/POS
receipt data and POSTs it here; this server talks to the EPSON TM-T82II
directly over USB using the `usb` (libusb) package — no Windows print spooler
involved.

## Prerequisites

- Node.js 14+ (`node --version`)
- EPSON TM-T82II connected via USB, powered on
- The printer bound to a **WinUSB** driver via Zadig (see below) — without
  this, libusb cannot open the device and every request fails with
  `LIBUSB_ERROR_NOT_SUPPORTED`

## Install

```powershell
npm install
```

## Bind the printer with Zadig (required once, on Windows)

By default Windows binds its own printer driver to the device, which claims
the USB interface and blocks libusb from opening it directly. Zadig replaces
that binding:

1. Download Zadig: https://zadig.akeo.ie
2. Plug in the printer and power it on
3. Open Zadig → **Options → List All Devices**
4. Select the EPSON TM-T82II (vendor/product ID `04B8`/`0202` by default —
   confirm via Device Manager or `GET /debug/devices` once the server is
   running)
5. Choose **WinUSB** in the driver dropdown and click **Replace Driver**

After this the printer no longer appears as a normal Windows printer — it's
only reachable through this server. To revert, use Device Manager → the
device → Update Driver → reinstall the standard/EPSON driver.

## Configure

Copy the relevant variables from `.env.printer.example` into the frontend's
`.env`:

```env
VITE_PRINT_SERVER_URL=http://localhost:3002/print
VITE_AUTO_PRINT_ENABLED=true
```

Environment variables read by the server itself:

| Variable           | Default    | Purpose                                   |
| ------------------ | ---------- | ------------------------------------------ |
| `PORT`              | `3002`     | Port the server listens on                 |
| `EPSON_VENDOR_ID`    | `0x04b8`   | USB vendor ID to match                     |
| `EPSON_PRODUCT_ID`   | `0x0202`   | USB product ID to match                    |
| `DEBUG`              | `false`    | Verbose per-step connection logging        |

Vendor/product ID can also be changed at runtime via `POST /config` (see
below) without restarting the server.

## Run

```powershell
npm start          # node print-server.js
npm run dev         # nodemon print-server.js (auto-restart on change)
node print-server.js --debug   # verbose logging
```

## API

**Main**
| Method | Path           | Body                                                                 |
| ------ | -------------- | --------------------------------------------------------------------- |
| GET    | `/health`      | —                                                                       |
| GET    | `/printers`    | —                                                                       |
| GET    | `/config`      | —                                                                       |
| POST   | `/config`      | `{ vendorId?, productId? }` (hex strings, e.g. `"0x04b8"`)             |
| POST   | `/print`       | `{ queueNumber, departmentName, serviceName, priorityName?, timestamp?, printerName? }` |
| POST   | `/test-print`  | —                                                                       |

**Debug**
| Method | Path                     | Purpose                                  |
| ------ | ------------------------ | ------------------------------------------ |
| GET    | `/debug/devices`         | List all USB devices with vendor/product IDs |
| GET    | `/debug/windows-printers`| List printers Windows itself recognizes    |

`POST /print` responses:
```json
// success
{ "success": true, "message": "...", "ticketNumber": "...", "method": "usb", "bytes": 123, "timestamp": "..." }
// error
{ "success": false, "error": "...", "troubleshooting": ["...", "..."] }
```

## Troubleshooting

| Issue                                | Solution                                                              |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `LIBUSB_ERROR_NOT_SUPPORTED`           | Bind the printer to WinUSB via Zadig — see above                        |
| Printer not found in `/debug/devices`  | Check the USB cable, confirm the printer is powered on                  |
| Wrong vendor/product ID                | `POST /config` with the correct hex IDs from `/debug/devices`           |
| `Port 3002 already in use`             | `PORT=3003 npm start` and update `VITE_PRINT_SERVER_URL` to match       |

## License

Part of the Medique HIS project.
