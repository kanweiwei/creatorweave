#!/bin/bash
# Build script for example plugins

set -e

echo "Building MD5 Calculator plugin..."
cd md5-calculator
wasm-pack build --target web --out-dir ../../../../web/public/wasm/plugins/md5-calculator
cd ..

echo "Building Line Counter plugin..."
cd line-counter
wasm-pack build --target web --out-dir ../../../../web/public/wasm/plugins/line-counter
cd ..

echo "All plugins built successfully!"
