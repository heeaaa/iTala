from PIL import Image, ImageDraw
import math

BG = (14, 17, 22)        # charcoal
ORANGE = (238, 103, 48)  # basketball orange
LINE = (20, 22, 26)

def basketball(size, ball_frac=0.62, bg=BG, transparent_bg=False):
    img = Image.new("RGBA", (size, size), (0,0,0,0) if transparent_bg else bg+(255,))
    d = ImageDraw.Draw(img)
    r = int(size*ball_frac/2)
    cx = cy = size//2
    # ball
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=ORANGE+(255,))
    lw = max(3, size//90)
    # seams
    d.line([cx-r, cy, cx+r, cy], fill=LINE, width=lw)
    d.line([cx, cy-r, cx, cy+r], fill=LINE, width=lw)
    # curved seams (arcs)
    d.arc([cx-int(r*2.2), cy-r, cx-int(r*0.15), cy+r], 300, 60, fill=LINE, width=lw)
    d.arc([cx+int(r*0.15), cy-r, cx+int(r*2.2), cy+r], 120, 240, fill=LINE, width=lw)
    return img

# App icon 1024
basketball(1024).save("icon.png")
# Adaptive icon foreground (transparent bg, ball a bit smaller for safe zone)
basketball(1024, ball_frac=0.50, transparent_bg=True).save("adaptive-icon.png")
# Splash: ball centered on charcoal
splash = Image.new("RGBA", (1242, 1242), BG+(255,))
ball = basketball(560, ball_frac=0.92, transparent_bg=True)
splash.alpha_composite(ball, ((1242-560)//2, (1242-560)//2))
splash.convert("RGB").save("splash.png")
# Favicon
basketball(196).save("favicon.png")
print("assets written")
