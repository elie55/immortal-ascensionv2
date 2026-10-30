"""Cut Ma Shan Zheng (brush calligraphy) down to the Chinese characters the game uses.

Run it whenever new Chinese text is added (content, generators or UI code):

    python3 tools/fonts/subset_brush.py path/to/MaShanZheng-Regular.ttf

The source font is the Google Fonts release (ofl/mashanzheng). Needs fontTools and brotli
(`pip install fonttools brotli`). Writes src/ui/fonts/mashanzheng.woff2 and prints the count.
"""
import glob
import os
import re
import sys

from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "src", "ui", "fonts", "mashanzheng.woff2")
SOURCES = ["src/**/*.ts", "src/**/*.css", "content/**/*.json", "tools/gen/*.py"]
CJK = re.compile(r"[　-〿㐀-鿿豈-﫿＀-￯]")


def used_chars() -> set[str]:
    chars: set[str] = set()
    for pattern in SOURCES:
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            with open(path, encoding="utf-8", errors="ignore") as f:
                chars |= set(CJK.findall(f.read()))
    return chars


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    chars = used_chars()
    # Latin digits and punctuation stay so mixed strings ("第1层") keep one face.
    text = "".join(sorted(chars)) + "0123456789·・—-–:：,，.。!！?？()（）"
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(sys.argv[1], opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    subset.save_font(font, OUT, opts)
    print(f"{len(chars)} Chinese characters -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
