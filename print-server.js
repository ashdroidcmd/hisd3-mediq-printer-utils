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

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb" }));

// EPSON TM-T82II USB IDs (can be overridden via environment variables)
let EPSON_VENDOR_ID = parseInt(process.env.EPSON_VENDOR_ID || "0x04b8", 16);
let EPSON_PRODUCT_ID = parseInt(process.env.EPSON_PRODUCT_ID || "0x0202", 16);

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
    console.log("Exact match not found, searching for any EPSON printer...");
    device = devices.find((d) => d.deviceDescriptor.idVendor === 0x04b8);
    if (device) {
      console.log(
        `Found alternate EPSON device: 0x${device.deviceDescriptor.idVendor.toString(16)}:0x${device.deviceDescriptor.idProduct.toString(16)}`,
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
    device = findUsbDevice(EPSON_VENDOR_ID, EPSON_PRODUCT_ID);

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

    console.log(
      `Found EPSON TM-T82II: ${device.busNumber}:${device.deviceAddress}`,
    );

    // Try to open device
    try {
      device.open();
      console.log("✓ Device opened");
    } catch (openError) {
      console.error(`Cannot open device directly: ${openError.message}`);
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
      console.log("✓ Interface found");
    } catch (ifError) {
      device.close();
      throw new Error(`Failed to get interface: ${ifError.message}`);
    }

    // Try to claim interface
    try {
      iface.claim();
      console.log("✓ Interface claimed");
    } catch (claimError) {
      device.close();
      console.error(`Cannot claim interface: ${claimError.message}`);
      throw new Error(
        `Failed to claim interface: ${claimError.message}. ` +
          `This usually means another driver (Windows printer driver) is using the device.`,
      );
    }

    // Find output endpoint
    const endpoints = iface.endpoints;
    console.log(`Found ${endpoints.length} endpoint(s)`);

    const outEndpoint = endpoints.find((ep) => ep.direction === "out");

    if (!outEndpoint) {
      iface.release();
      device.close();
      throw new Error("No output endpoint found on printer");
    }

    console.log(
      `✓ Connected to EPSON TM-T82II (Endpoint: 0x${outEndpoint.address.toString(16)})`,
    );

    return {
      device,
      interface: iface,
      endpoint: outEndpoint,
    };
  } catch (error) {
    console.error(`✗ Failed to connect to printer:`, error.message);
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
        console.error("Transfer error:", error);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Print via Windows Print Spooler (alternative method)
 * This uses the system printer instead of direct USB access
 */
async function printViaWindowsSpooler(printerName, data) {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    // Create temporary file with ESC/POS data
    const tempFile = path.join(os.tmpdir(), `print_${Date.now()}.bin`);

    try {
      // Write binary data to temp file
      fs.writeFileSync(tempFile, data);

      // Use Windows print command - this sends to printer spooler
      const cmd = `type "${tempFile}" | ${printerName}`;

      exec(cmd, (error, stdout, stderr) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }

        if (error) {
          console.error("Windows print error:", error.message);
          reject(new Error(`Windows print failed: ${error.message}`));
        } else {
          resolve();
        }
      });
    } catch (error) {
      // Clean up on error
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      reject(error);
    }
  });
}

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  const device = findUsbDevice(EPSON_VENDOR_ID, EPSON_PRODUCT_ID);
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
    const device = findUsbDevice(EPSON_VENDOR_ID, EPSON_PRODUCT_ID);
    res.json({
      available: !!device,
      printer: "EPSON TM-T82II",
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
        epsonVendorId: "0x" + EPSON_VENDOR_ID.toString(16).padStart(4, "0"),
        epsonProductId: "0x" + EPSON_PRODUCT_ID.toString(16).padStart(4, "0"),
      },
      instruction: "Use POST /debug/configure to set custom vendor/product IDs",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Configure printer IDs
 */
app.post("/debug/configure", (req, res) => {
  try {
    const { vendorId, productId } = req.body;

    if (!vendorId || !productId) {
      return res.status(400).json({
        error: "Missing vendorId or productId",
        example: { vendorId: "0x04b8", productId: "0x0202" },
      });
    }

    // Parse hex strings
    EPSON_VENDOR_ID = parseInt(vendorId, 16);
    EPSON_PRODUCT_ID = parseInt(productId, 16);

    console.log(`✓ Printer configuration updated: ${vendorId}:${productId}`);

    res.json({
      success: true,
      message: "Printer configuration updated",
      config: {
        vendorId,
        productId,
      },
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
  let usedFallbackMethod = false;

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
    if (!queueNumber || !departmentName || !serviceName || !priorityName) {
      return res.status(400).json({
        error:
          "Missing required fields: queueNumber, departmentName, serviceName, priorityName",
      });
    }

    console.log(`\n📋 Printing ticket: ${queueNumber}`);
    console.log(`   Department: ${departmentName}`);
    console.log(`   Service: ${serviceName}`);
    console.log(`   Priority: ${priorityName}`);

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
    receipt += departmentName + LF;
    receipt += ESC + "E\x00"; // Disable bold

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
    console.log(`  Sending ${data.length} bytes to printer...`);

    // Try USB method first
    try {
      printerConnection = await connectPrinter();
      await sendToPrinter(printerConnection, data);
    } catch (usbError) {
      console.warn("USB method failed, trying Windows Print Spooler...");
      usedFallbackMethod = true;

      // For Windows, we cannot use direct USB due to driver conflicts
      // Instead, provide a helpful error message with instructions
      throw new Error(
        `USB Access Blocked: ${usbError.message}. ` +
          `On Windows, the printer driver prevents direct USB access via libusb. ` +
          `Workaround: Use PowerShell to create a print job or reconfigure printer drivers.`,
      );
    }

    // Add delay before closing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("✓ Ticket printed successfully");

    res.json({
      success: true,
      message: "Ticket printed successfully",
      ticketNumber: queueNumber,
      method: usedFallbackMethod ? "fallback" : "usb",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Print error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      troubleshooting: `On Windows with printer drivers installed, direct USB access is blocked. Try: 1) Check /debug/devices for your actual printer IDs, 2) Remove printer from Windows Devices, 3) Reinstall with libusb drivers, or 4) Use Windows Print Spooler instead of direct USB`,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    // Close printer connection
    if (printerConnection) {
      try {
        printerConnection.interface.release();
        printerConnection.device.close();
        console.log("Printer connection closed");
      } catch (e) {
        console.error("Error closing printer:", e.message);
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
    console.log(`\n🧪 Testing printer...`);

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
    console.log(`  Sending test data (${data.length} bytes)...`);

    await sendToPrinter(printerConnection, data);

    // Add delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("✓ Test print successful");

    res.json({
      success: true,
      message: "Test print successful",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Test print error:", error);
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
        console.log("Printer connection closed");
      } catch (e) {
        console.error("Error closing printer:", e.message);
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
  console.error("Unhandled error:", err);
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
  POST /print               - Print a queue ticket
  POST /test-print          - Test printer connection

Debug Endpoints:
  GET  /debug/devices       - List all USB devices with IDs
  GET  /debug/windows-printers - List Windows printers (Windows only)
  POST /debug/configure     - Set printer vendor/product IDs

Configuration:
  PORT: ${PORT}
  NODE_ENV: ${process.env.NODE_ENV || "development"}
  VENDOR_ID: 0x${EPSON_VENDOR_ID.toString(16).padStart(4, "0")}
  PRODUCT_ID: 0x${EPSON_PRODUCT_ID.toString(16).padStart(4, "0")}

TROUBLESHOOTING LIBUSB_ERROR_NOT_SUPPORTED on Windows:
─────────────────────────────────────────────────────────────
This error means Windows printer drivers are preventing USB access via libusb.

Step 1: Check what's connected
  curl http://localhost:3002/debug/devices
  curl http://localhost:3002/debug/windows-printers

Step 2: If printer is in "Not Found" error:
  a) Verify printer is powered on and connected
  b) Check Device Manager for the printer
  c) Try: POST /debug/configure with correct vendor/product IDs

Step 3: If printer is found but LIBUSB_ERROR_NOT_SUPPORTED occurs:
  a) WINDOWS IS BLOCKING DIRECT USB ACCESS - This is expected!
  b) Options:
     - Option A: Uninstall Windows printer driver and install libusb drivers
     - Option B: Use Windows Print Spooler instead of direct USB
     - Option C: Use print-to-file and then send file to LPT/COM port

Step 4: Test with actual system printer name:
  GET /debug/windows-printers returns available printers
  Use printer name in requests: { "printerName": "EPSON TM-T82II" }

For more help, check the console output above.
  `);
});
