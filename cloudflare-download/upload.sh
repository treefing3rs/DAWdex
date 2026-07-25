#!/bin/bash
# 本地 Mac 用这个脚本把渲染好的 MP3 上传到 Cloudflare
# 用法: ./upload.sh <file.mp3> [title] [style] [bpm] [key]
# 上传完自动生成二维码（终端 + PNG 文件）

WORKER_URL="https://dawdex.heranlab.com"
SECRET="dawdex-hackathon-2026"

FILE="${1:?Usage: ./upload.sh <file> [title] [style] [bpm] [key]}"
TITLE="${2:-DAWdex Creation}"
STYLE="${3:-dubstep}"
BPM="${4:-140}"
KEY="${5:-C minor}"
ROLES="${6:-drums,bass,keys}"

echo "⬆ Uploading: $FILE"
echo "  Title: $TITLE | Style: $STYLE | BPM: $BPM | Key: $KEY"

RESPONSE=$(curl -s -X POST "$WORKER_URL/upload" \
  -H "Authorization: Bearer $SECRET" \
  -F "file=@$FILE" \
  -F "title=$TITLE" \
  -F "style=$STYLE" \
  -F "bpm=$BPM" \
  -F "key=$KEY" \
  -F "roles=$ROLES")

echo ""
echo "✅ Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

# 提取下载链接
URL=$(echo "$RESPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('url',''))" 2>/dev/null)
if [ -n "$URL" ]; then
  echo ""
  echo "🔗 Download page: $URL"
  echo ""

  # 生成二维码 PNG + 终端显示
  QR_FILE="/tmp/dawdex-qr-$(date +%s).png"
  python3 -c "
import qrcode
url = '$URL'
qr = qrcode.QRCode(version=1, box_size=10, border=2)
qr.add_data(url)
qr.make(fit=True)
img = qr.make_image(fill_color='black', back_color='white')
img.save('$QR_FILE')
# 终端内打印文字版二维码
qr.print_ascii(invert=True)
" 2>/dev/null

  echo ""
  echo "📱 QR Code saved: $QR_FILE"
  echo "   Open it: open $QR_FILE"
fi
