/**
 * Print Server for EPSON TM-T82II Thermal Printer
 *
 * This is an Express.js backend service that handles USB printing
 * Install required dependencies:
 * npm install express cors body-parser usb
 *
 * Usage:
 * node print-server.js
 *
 * The server will run on http://localhost:3002
 */

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const usb = require("usb");

const app = express();
const PORT = process.env.PORT || 3002;
const DEBUG = process.argv.includes("--debug") || process.env.DEBUG === "true";

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb" }));

// Logger
const log = (message, isDebug = false) => {
  if (isDebug && !DEBUG) return;
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ${message}`);
};

// Only ever accept a hex vendor/product ID shaped like "0x04b8" or "04b8".
const HEX_ID_PATTERN = /^(0x)?[0-9a-fA-F]{1,4}$/;

function isValidHexId(id) {
  return typeof id === "string" && HEX_ID_PATTERN.test(id);
}

// EPSON TM-T82II USB IDs (can be overridden via environment variables or POST /config)
const printerConfig = {
  name: "EPSON TM-T82II",
  model: "TM-T82II",
  paperWidth: 80,
  vendorId: process.env.EPSON_VENDOR_ID || "0x04b8",
  productId: process.env.EPSON_PRODUCT_ID || "0x0202",
};

function currentVendorId() {
  return parseInt(printerConfig.vendorId, 16);
}

function currentProductId() {
  return parseInt(printerConfig.productId, 16);
}

// Store for connected printers (legacy - kept for compatibility)
const connectedPrinters = {};

/**
 * Find USB device by vendor and product ID
 */
function findUsbDevice(vendorId, productId) {
  const devices = usb.getDeviceList();

  // First try exact match
  let device = devices.find((device) => {
    return (
      device.deviceDescriptor.idVendor === vendorId &&
      device.deviceDescriptor.idProduct === productId
    );
  });

  // If exact match fails and we're looking for EPSON, try any EPSON printer
  if (!device && vendorId === 0x04b8) {
    log("Exact match not found, searching for any EPSON printer...", true);
    device = devices.find((d) => d.deviceDescriptor.idVendor === 0x04b8);
    if (device) {
      log(
        `Found alternate EPSON device: 0x${device.deviceDescriptor.idVendor.toString(16)}:0x${device.deviceDescriptor.idProduct.toString(16)}`,
        true,
      );
    }
  }

  return device;
}

/**
 * Connect to printer via USB
 */
async function connectPrinter() {
  let device = null;

  try {
    device = findUsbDevice(currentVendorId(), currentProductId());

    if (!device) {
      const allDevices = usb.getDeviceList();
      const deviceInfo = allDevices
        .map(
          (d) =>
            `0x${d.deviceDescriptor.idVendor.toString(16).padStart(4, "0")}:0x${d.deviceDescriptor.idProduct.toString(16).padStart(4, "0")}`,
        )
        .join(", ");

      throw new Error(
        `EPSON TM-T82II not found (looking for 0x04b8:0x0202). ` +
          `${allDevices.length} device(s) found: ${deviceInfo}. ` +
          `Call GET /debug/devices to see full details.`,
      );
    }

    log(
      `Found EPSON TM-T82II: ${device.busNumber}:${device.deviceAddress}`,
      true,
    );

    // Try to open device
    try {
      device.open();
      log("✓ Device opened", true);
    } catch (openError) {
      log(`Cannot open device directly: ${openError.message}`);
      throw new Error(
        `Failed to open printer: ${openError.message}. ` +
          `The printer may have Windows drivers preventing USB access. ` +
          `Try: (1) Check Device Manager for printer conflicts, ` +
          `(2) Remove printer from Windows devices, ` +
          `(3) Install libusb drivers, ` +
          `or (4) Use Windows Print API instead of direct USB.`,
      );
    }

    // Try to get interface
    let iface = null;
    try {
      iface = device.interface(0);
      log("✓ Interface found", true);
    } catch (ifError) {
      device.close();
      throw new Error(`Failed to get interface: ${ifError.message}`);
    }

    // Try to claim interface
    try {
      iface.claim();
      log("✓ Interface claimed", true);
    } catch (claimError) {
      device.close();
      log(`Cannot claim interface: ${claimError.message}`);
      throw new Error(
        `Failed to claim interface: ${claimError.message}. ` +
          `This usually means another driver (Windows printer driver) is using the device.`,
      );
    }

    // Find output endpoint
    const endpoints = iface.endpoints;
    log(`Found ${endpoints.length} endpoint(s)`, true);

    const outEndpoint = endpoints.find((ep) => ep.direction === "out");

    if (!outEndpoint) {
      iface.release();
      device.close();
      throw new Error("No output endpoint found on printer");
    }

    log(
      `✓ Connected to EPSON TM-T82II (Endpoint: 0x${outEndpoint.address.toString(16)})`,
      true,
    );

    return {
      device,
      interface: iface,
      endpoint: outEndpoint,
    };
  } catch (error) {
    log(`✗ Failed to connect to printer: ${error.message}`);
    // Clean up if device was opened
    if (device) {
      try {
        device.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    throw error;
  }
}

/**
 * Send data to printer
 */
async function sendToPrinter(printerConnection, data) {
  return new Promise((resolve, reject) => {
    printerConnection.endpoint.transfer(data, (error) => {
      if (error) {
        log(`Transfer error: ${error.message || error}`);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  const device = findUsbDevice(currentVendorId(), currentProductId());
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    printer: {
      type: "EPSON TM-T82II",
      detected: !!device,
      status: device ? "connected" : "not found",
    },
  });
});

/**
 * List available printers
 */
app.get("/printers", async (req, res) => {
  try {
    const device = findUsbDevice(currentVendorId(), currentProductId());
    res.json({
      available: !!device,
      printer: printerConfig.name,
      status: device ? "connected" : "not found",
      info: "USB printer detection",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoint - list all USB devices
 */
app.get("/debug/devices", (req, res) => {
  try {
    const devices = usb.getDeviceList();
    const deviceList = devices.map((device) => ({
      busNumber: device.busNumber,
      deviceAddress: device.deviceAddress,
      vendorId:
        "0x" + device.deviceDescriptor.idVendor.toString(16).padStart(4, "0"),
      productId:
        "0x" + device.deviceDescriptor.idProduct.toString(16).padStart(4, "0"),
      manufacturer: device.deviceDescriptor.iManufacturer,
      product: device.deviceDescriptor.iProduct,
      serialNumber: device.deviceDescriptor.iSerialNumber,
    }));

    res.json({
      totalDevices: devices.length,
      devices: deviceList,
      currentConfig: {
        epsonVendorId: "0x" + currentVendorId().toString(16).padStart(4, "0"),
        epsonProductId:
          "0x" + currentProductId().toString(16).padStart(4, "0"),
      },
      instruction: "Use POST /config to set custom vendor/product IDs",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /config - Get current configuration
 */
app.get("/config", (req, res) => {
  res.json({
    printer: printerConfig,
    environment: {
      port: PORT,
      debug: DEBUG,
      nodeVersion: process.version,
      platform: process.platform,
    },
  });
});

/**
 * POST /config - Update printer vendor/product IDs
 */
app.post("/config", (req, res) => {
  try {
    const { vendorId, productId } = req.body;

    if (vendorId === undefined && productId === undefined) {
      return res.status(400).json({
        error: "Missing vendorId or productId",
        example: { vendorId: "0x04b8", productId: "0x0202" },
      });
    }

    if (vendorId !== undefined) {
      if (!isValidHexId(vendorId)) {
        return res.status(400).json({
          error: `Invalid vendorId. Expected a hex string like "0x04b8", got: ${vendorId}`,
        });
      }
      printerConfig.vendorId = vendorId;
    }

    if (productId !== undefined) {
      if (!isValidHexId(productId)) {
        return res.status(400).json({
          error: `Invalid productId. Expected a hex string like "0x0202", got: ${productId}`,
        });
      }
      printerConfig.productId = productId;
    }

    log(
      `✓ Printer configuration updated: ${printerConfig.vendorId}:${printerConfig.productId}`,
    );

    res.json({
      success: true,
      config: printerConfig,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Print ticket endpoint
 */
app.post("/print", async (req, res) => {
  let printerConnection = null;

  try {
    const {
      queueNumber,
      departmentName,
      serviceName,
      priorityName,
      timestamp,
      printerName = "EPSON TM-T82II",
    } = req.body;

    // Validate required fields
    if (!queueNumber || !departmentName || !serviceName) {
      return res.status(400).json({
        error:
          "Missing required fields: queueNumber, departmentName, serviceName",
      });
    }

    log(`📋 Printing ticket: ${queueNumber}`);
    log(`   Department: ${departmentName}`);
    log(`   Service: ${serviceName}`);
    if (priorityName) log(`   Priority: ${priorityName}`);

    // Build ESC/POS commands
    const ESC = "\x1B";
    const GS = "\x1D";
    const LF = "\x0A";

    // Build the receipt
    let receipt = "";

    // Initialize printer
    receipt += ESC + "@";

    // Add generous top spacing to center vertically
    receipt += LF;

    // Set center alignment
    receipt += ESC + "a\x01";

    // Label (normal size)
    receipt += "Your Queue Number Is" + LF + LF;

    // Set bold
    receipt += ESC + "E\x01";

    // Large queue number (4x4 size, centered)
    receipt += GS + "!" + "\x33";

    receipt += queueNumber + LF;

    receipt += ESC + "!" + String.fromCharCode(0x00); // Reset to normal size

    // Disable bold
    receipt += ESC + "E\x00";

    // Add department name (bold, normal size)
    receipt += ESC + "E\x01"; // Enable bold
    receipt += GS + "!" + "\x11";
    receipt += departmentName + LF;
    receipt += ESC + "E\x00"; // Disable bold
    receipt += ESC + "!" + String.fromCharCode(0x00); // Reset to normal size

    // Add timestamp (normal size, centered)
    receipt += LF;
    if (timestamp) {
      const date = new Date(timestamp).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const time = new Date(timestamp).toLocaleTimeString("en-US", {
        hour12: true,
      });
      receipt += date + LF;
      receipt += time + LF;
    }

    // Wait for call message
    receipt += LF + "Wait for your call" + LF;

    // Add spacing after
    receipt += LF + LF + LF + LF + LF + LF;

    // Cut paper
    receipt += GS + "V\x00"; // Partial cut

    // Send to printer
    const data = Buffer.from(receipt, "binary");
    log(`Sending ${data.length} bytes to printer...`, true);

    // Send via direct USB
    try {
      printerConnection = await connectPrinter();
      await sendToPrinter(printerConnection, data);
    } catch (usbError) {
      throw new Error(
        `USB Access Blocked: ${usbError.message}. ` +
          `On Windows, the printer driver prevents direct USB access via libusb. ` +
          `Use Zadig to bind a WinUSB driver to the printer, or check Device Manager for driver conflicts.`,
      );
    }

    // Add delay before closing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    log("✓ Ticket printed successfully");

    res.json({
      success: true,
      message: "Ticket printed successfully",
      ticketNumber: queueNumber,
      method: "usb",
      bytes: data.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log(`✗ Print error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      troubleshooting: [
        "Check GET /debug/devices for your actual printer vendor/product IDs",
        "Confirm the printer is bound to a WinUSB driver via Zadig, not the default Windows printer driver",
        "Check Device Manager for driver conflicts",
        "Check GET /debug/windows-printers to see printers Windows recognizes",
      ],
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    // Close printer connection
    if (printerConnection) {
      try {
        printerConnection.interface.release();
        printerConnection.device.close();
        log("Printer connection closed", true);
      } catch (e) {
        log(`Error closing printer: ${e.message}`);
      }
    }
  }
});

/**
 * Test print endpoint for debugging
 */
app.post("/test-print", async (req, res) => {
  let printerConnection = null;

  try {
    log("🧪 Testing printer...");

    // Connect to printer
    printerConnection = await connectPrinter();

    // Build ESC/POS commands for test
    const ESC = "\x1B";
    const LF = "\x0A";

    let receipt = "";
    receipt += ESC + "@"; // Initialize
    receipt += ESC + "a\x01"; // Center
    receipt += ESC + "!" + String.fromCharCode(0x11); // 2x2
    receipt += "TEST PRINT" + LF;
    receipt += ESC + "!" + String.fromCharCode(0x00); // 1x1
    receipt += LF;
    receipt += ESC + "a\x00"; // Left
    receipt += "This is a test print from the print server." + LF;
    receipt += "If you can see this, your printer is working correctly!" + LF;
    receipt += LF;

    const timestamp = new Date().toLocaleString("en-US");
    receipt += "Timestamp: " + timestamp + LF;
    receipt += LF;

    const data = Buffer.from(receipt, "binary");
    log(`Sending test data (${data.length} bytes)...`, true);

    await sendToPrinter(printerConnection, data);

    // Add delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    log("✓ Test print successful");

    res.json({
      success: true,
      message: "Test print successful",
      method: "usb",
      bytes: data.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log(`✗ Test print error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    // Close printer connection
    if (printerConnection) {
      try {
        printerConnection.interface.release();
        printerConnection.device.close();
        log("Printer connection closed", true);
      } catch (e) {
        log(`Error closing printer: ${e.message}`);
      }
    }
  }
});

/**
 * Windows Printer Diagnostic
 */
app.get("/debug/windows-printers", (req, res) => {
  try {
    const { exec } = require("child_process");
    const os = require("os");

    if (os.platform() !== "win32") {
      return res.status(400).json({
        error: "This endpoint is only available on Windows",
      });
    }

    // Get list of printers via Windows command
    exec(
      "Get-Printer -ErrorAction SilentlyContinue | Select-Object Name",
      { shell: "powershell" },
      (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({
            error: `Failed to query printers: ${error.message}`,
            hint: "Make sure PowerShell is available and user has printer permissions",
          });
        }

        const printers = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && line !== "Name" && line !== "----");

        res.json({
          platform: "Windows",
          totalPrinters: printers.length,
          printers: printers,
          hint: "If your printer appears here but USB access is blocked, try printing to this printer name instead of direct USB",
        });
      },
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Error handler middleware
 */
app.use((err, req, res, next) => {
  log(`Unhandled error: ${err.message}`);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         EPSON TM-T82II Print Server                          ║
║         Running on http://localhost:${PORT}                      ║
╚════════════════════════════════════════════════════════════════╝

Main Endpoints:
  GET  /health              - Health check
  GET  /printers            - List available printers
  GET  /config              - Show current configuration
  POST /config              - Update printer vendor/product IDs
  POST /print               - Print a queue ticket
  POST /test-print          - Test printer connection

Debug Endpoints:
  GET  /debug/devices       - List all USB devices with IDs
  GET  /debug/windows-printers - List Windows printers (Windows only)

Configuration:
  PORT: ${PORT}
  NODE_ENV: ${process.env.NODE_ENV || "development"}
  DEBUG: ${DEBUG}
  VENDOR_ID: 0x${currentVendorId().toString(16).padStart(4, "0")}
  PRODUCT_ID: 0x${currentProductId().toString(16).padStart(4, "0")}

TROUBLESHOOTING LIBUSB_ERROR_NOT_SUPPORTED on Windows:
─────────────────────────────────────────────────────────────
This error means Windows printer drivers are preventing USB access via libusb.

Step 1: Check what's connected
  curl http://localhost:3002/debug/devices
  curl http://localhost:3002/debug/windows-printers

Step 2: If printer is in "Not Found" error:
  a) Verify printer is powered on and connected
  b) Check Device Manager for the printer
  c) Try: POST /config with correct vendor/product IDs

Step 3: If printer is found but LIBUSB_ERROR_NOT_SUPPORTED occurs:
  a) WINDOWS IS BLOCKING DIRECT USB ACCESS - This is expected!
  b) Fix: Use Zadig (https://zadig.akeo.ie) to bind a WinUSB driver to
     the printer's USB interface. This replaces the default Windows
     printer driver, which is what's blocking libusb from claiming it.

Step 4: Test with actual system printer name:
  GET /debug/windows-printers returns available printers
  Use printer name in requests: { "printerName": "EPSON TM-T82II" }

For more help, check the console output above.
  `);
});
