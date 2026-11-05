#!/usr/bin/env bash
# Regenerates every icon, splash and badge from assets/logo.png (1254x1254, chrome J on black)
# and assets/logo-mono.png (white silhouette, transparent). Needs ImageMagick `convert`.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v convert >/dev/null || { echo "ImageMagick convert is required"; exit 1; }
mkdir -p public/icons android-res
convert assets/logo.png -resize 192x192 public/icons/icon-192.png
convert assets/logo.png -resize 512x512 public/icons/icon-512.png
convert assets/logo.png -resize 400x400 -gravity center -background black -extent 512x512 public/icons/icon-512-maskable.png
convert assets/logo.png -resize 180x180 public/icons/apple-touch-icon.png
convert assets/logo.png -resize 64x64 public/favicon.png
convert assets/logo-mono.png -resize 72x72 -gravity center -background none -extent 72x72 public/icons/badge-72.png
convert assets/logo.png -resize 1024x1024 android-res/ic_launcher_foreground.png
convert assets/logo-mono.png -resize 96x96 -gravity center -background none -extent 96x96 android-res/ic_notification.png
convert -size 2732x2732 xc:black \( assets/logo.png -resize 900x900 \) -gravity center -composite android-res/splash.png
echo "icons regenerated from assets/logo.png"
