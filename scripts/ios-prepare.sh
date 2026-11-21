#!/usr/bin/env bash
# Run on macOS after `cap add ios` or `cap sync ios`.
# Adds the privacy texts iOS needs (camera for QR scan, location for DWRs)
# and the app-bound domains the web view may use. Safe to run many times.
set -euo pipefail

PLIST="ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy

if [ ! -f "$PLIST" ]; then
  echo "Info.plist not found. Run 'npm run ios:add' first." >&2
  exit 1
fi

set_str () { # key value
  "$PB" -c "Set :$1 $2" "$PLIST" 2>/dev/null || "$PB" -c "Add :$1 string $2" "$PLIST"
}

set_str NSCameraUsageDescription "DUN RIGHT uses the camera to scan equipment QR labels and to take site photos."
set_str NSPhotoLibraryUsageDescription "DUN RIGHT lets you attach photos to field reports."
set_str NSLocationWhenInUseUsageDescription "DUN RIGHT uses your location to fill in site details on daily work reports."

# App-bound domains (needed for service workers in the web view)
"$PB" -c "Delete :WKAppBoundDomains" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :WKAppBoundDomains array" "$PLIST"
i=0
for d in witty-plant-05789e010.7.azurestaticapps.net login.microsoftonline.com graph.microsoft.com; do
  "$PB" -c "Add :WKAppBoundDomains:$i string $d" "$PLIST"
  i=$((i+1))
done

echo "Info.plist updated."
