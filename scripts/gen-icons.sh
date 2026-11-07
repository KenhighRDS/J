#!/usr/bin/env bash
# Regenerates every icon, splash and badge from assets/logo.png (1254x1254, chrome J on black)
# and assets/logo-mono.png (white silhouette, transparent), and installs them into the web app and the
# Android project. Needs ImageMagick `convert`. Run: npm run icons
set -euo pipefail
cd "$(dirname "$0")/.."
command -v convert >/dev/null || { echo "ImageMagick convert is required"; exit 1; }
RES=android/app/src/main/res
mkdir -p public/icons android-res "$RES/drawable"

# web / PWA
convert assets/logo.png -resize 192x192 public/icons/icon-192.png
convert assets/logo.png -resize 512x512 public/icons/icon-512.png
convert assets/logo.png -resize 400x400 -gravity center -background black -extent 512x512 public/icons/icon-512-maskable.png
convert assets/logo.png -resize 180x180 public/icons/apple-touch-icon.png
convert assets/logo.png -resize 64x64 public/favicon.png
convert assets/logo-mono.png -resize 72x72 -gravity center -background none -extent 72x72 public/icons/badge-72.png

# Android adaptive icon: the J must sit inside the 66% safe zone, so the logo is inset on a black canvas
convert assets/logo.png -resize 820x820 -gravity center -background black -extent 1024x1024 android-res/ic_launcher_foreground.png
convert assets/logo-mono.png -resize 96x96 -gravity center -background none -extent 96x96 android-res/ic_notification.png
convert -size 2732x2732 xc:black \( assets/logo.png -resize 900x900 \) -gravity center -composite android-res/splash.png
cp android-res/ic_launcher_foreground.png android-res/ic_notification.png "$RES/drawable/"
for d in "$RES"/drawable "$RES"/drawable-land-* "$RES"/drawable-port-*; do cp android-res/splash.png "$d/splash.png"; done
# Capacitor's default robot vector would outrank the PNG foreground on Android 7+
rm -f "$RES/drawable-v24/ic_launcher_foreground.xml"; rmdir "$RES/drawable-v24" 2>/dev/null || true

# legacy launcher icons (Android < 8): square and round, per density
for pair in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  d=${pair%%:*}; s=${pair##*:}; r=$((s / 2)); mkdir -p "$RES/mipmap-$d"
  convert assets/logo.png -resize ${s}x${s} "$RES/mipmap-$d/ic_launcher.png"
  convert "$RES/mipmap-$d/ic_launcher.png" \( -size ${s}x${s} xc:none -fill white -draw "circle $r,$r $r,0" \) -alpha off -compose CopyOpacity -composite "$RES/mipmap-$d/ic_launcher_round.png"
done
echo "icons regenerated from assets/logo.png"
