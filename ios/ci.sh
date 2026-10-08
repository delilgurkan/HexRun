#!/usr/bin/env bash
# HexRun iOS/watchOS CI: proje üretimi, HexRunKit testleri, iOS testleri (birim + UI) ve watchOS.
# Kullanım: ios/ci.sh   (macOS + Xcode 16; XcodeGen yoksa Homebrew ile kurulur)
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v xcodegen >/dev/null 2>&1; then
  brew install xcodegen
fi

echo "▸ xcodegen generate"
xcodegen generate --spec project.yml

echo "▸ HexRunKit (swift test)"
(cd HexRunKit && swift test)

# Kullanılabilir ilk simülatör (runner imajı değişse de kırılmasın).
pick_sim() { # $1: cihaz adı öneki ("iPhone" | "Apple Watch"), $2: çalışma zamanı öneki ("iOS" | "watchOS")
  xcrun simctl list devices available -j | python3 -c '
import json, sys
prefix, runtime = sys.argv[1], sys.argv[2]
data = json.load(sys.stdin)["devices"]
best = None
for rt, devs in data.items():
    name = rt.split(".")[-1]  # com.apple.CoreSimulator.SimRuntime.iOS-18-0
    if not name.startswith(runtime + "-"):
        continue
    ver = tuple(int(x) for x in name.split("-")[1:] if x.isdigit())
    for d in devs:
        if d.get("isAvailable", True) and d["name"].startswith(prefix):
            if best is None or ver > best[0]:
                best = (ver, d["udid"], d["name"])
if not best:
    sys.exit("simülatör yok: " + prefix)
print(best[1])
' "$1" "$2"
}

IPHONE_ID="$(pick_sim "iPhone" "iOS")"
WATCH_ID="$(pick_sim "Apple Watch" "watchOS")"
echo "▸ iPhone simülatörü: $IPHONE_ID · Apple Watch simülatörü: $WATCH_ID"

rm -rf build
COMMON=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="")

echo "▸ iOS test (HexRunTests + HexRunUITests)"
xcodebuild -project HexRun.xcodeproj -scheme HexRun -destination "platform=iOS Simulator,id=$IPHONE_ID" \
  -resultBundlePath build/HexRun.xcresult "${COMMON[@]}" test

echo "▸ watchOS build"
xcodebuild -project HexRun.xcodeproj -scheme HexRunWatch -destination 'generic/platform=watchOS Simulator' "${COMMON[@]}" build

echo "▸ watchOS test (HexRunWatchTests)"
xcodebuild -project HexRun.xcodeproj -scheme HexRunWatchTests -destination "platform=watchOS Simulator,id=$WATCH_ID" \
  -resultBundlePath build/HexRunWatch.xcresult "${COMMON[@]}" test

echo "✓ tamam"
