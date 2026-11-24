#!/bin/sh
# Regenerates the site's raster icons.
#   favicon-16.png   from favicon-16.svg (pixel-snapped so the gutters stay crisp)
#   favicon-32.png   from favicon.svg
#   apple-touch-icon.png (180) and icon-512.png from the app icon
#     (disk-heatmap repo: app-icon.png, 1024x1024), passed as $1.
# og.png (1200x630) is a screenshot of og.html at 1200x630 in any Chromium:
#   chrome --headless --window-size=1200,630 --screenshot=og.png og.html
# Needs rsvg-convert and ImageMagick (magick).
# Run:  sh assets/build-icons.sh /path/to/app-icon.png
set -eu
cd "$(dirname "$0")"
rsvg-convert -w 16 -h 16 favicon-16.svg -o favicon-16.png
rsvg-convert -w 32 -h 32 favicon.svg -o favicon-32.png
icon=${1:?pass the path to app-icon.png}
magick "$icon" -resize 180x180 -strip apple-touch-icon.png
magick "$icon" -resize 512x512 -strip icon-512.png
echo "icons rebuilt in $(pwd)"
