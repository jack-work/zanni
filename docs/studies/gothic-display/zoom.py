import sys
from PIL import Image

src, dst, factor = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGB")
im = im.crop((0, 0, 320, 90))
im.resize((im.width * factor, im.height * factor), Image.NEAREST).save(dst)
