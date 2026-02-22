#!/bin/bash
# Setup script for EPSON TM-T82II Print Server on Linux/macOS

set -e

echo "╔════════════════════════════════════════╗"
echo "║  Setting up Print Server               ║"
echo "║  EPSON TM-T82II Thermal Printer       ║"
echo "╚════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR/.."

echo "📁 Project directory: $PROJECT_DIR"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js $NODE_VERSION found"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd "$SCRIPT_DIR"

if [ -f "package.json" ]; then
    npm install
    echo "✓ Dependencies installed"
else
    echo "⚠️  package.json not found in $SCRIPT_DIR"
    echo "   Creating package.json..."
    npm init -y
    npm install express cors body-parser node-thermal-printer
fi

# Check for USB permissions on Linux
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo ""
    echo "⚠️  Linux USB permissions check"
    
    if [ -e /dev/usb/lp0 ] || [ -e /dev/lp0 ]; then
        CURRENT_USER=$(whoami)
        if ! groups "$CURRENT_USER" | grep -q dialout; then
            echo "   ⚠️  Adding user to 'dialout' group for printer access..."
            echo "   You may need to enter your password:"
            sudo usermod -a -G dialout "$CURRENT_USER"
            echo "   ✓ User added to dialout group"
            echo "   ⚠️  Please log out and log back in for changes to take effect"
        fi
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the print server:"
echo "   npm start"
echo ""
echo "To test printer connection:"
echo "   npm test"
echo ""
echo "Configuration:"
echo "  - Set VITE_PRINT_SERVER_URL in your .env file"
echo "  - Default: http://localhost:3002/print"
echo ""
echo "See PRINTER_README.md for detailed setup instructions"
