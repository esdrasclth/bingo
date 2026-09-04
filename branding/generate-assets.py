from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "branding"
OUTPUT = ROOT / "public" / "branding"
GREEN = (0, 130, 83, 255)
RESAMPLE = Image.Resampling.LANCZOS


def resized(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.resize(size, RESAMPLE)


def on_green(image: Image.Image, size: int, inset: int = 0) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), GREEN)
    artwork_size = size - inset * 2
    artwork = resized(image, (artwork_size, artwork_size))
    canvas.alpha_composite(artwork, (inset, inset))
    return canvas


def clean_outer_corners(image: Image.Image) -> Image.Image:
    """Sustituye solo el fondo negro conectado a las cuatro esquinas."""
    cleaned = image.copy()
    width, height = cleaned.size
    for corner in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        ImageDraw.floodfill(cleaned, corner, GREEN, thresh=60)
    return cleaned


OUTPUT.mkdir(parents=True, exist_ok=True)

with Image.open(SOURCE / "logo.png") as source_logo:
    logo = clean_outer_corners(source_logo.convert("RGBA"))

    # Copia pública de alta resolución y tamaños estándar para navegador/PWA.
    logo.save(OUTPUT / "logo.png", optimize=True)
    for size, name in (
        (16, "favicon-16x16.png"),
        (32, "favicon-32x32.png"),
        (180, "apple-touch-icon.png"),
        (192, "icon-192x192.png"),
        (512, "icon-512x512.png"),
        (150, "mstile-150x150.png"),
    ):
        target = on_green(logo, size) if size in (150, 180) else resized(logo, (size, size))
        target.save(OUTPUT / name, optimize=True)

    # Android puede recortar los iconos con distintas formas; este margen
    # mantiene la parte importante del logo dentro de su zona segura.
    on_green(logo, 512, inset=51).save(OUTPUT / "icon-maskable-512x512.png", optimize=True)

    logo.save(
        OUTPUT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

with Image.open(SOURCE / "cover.png") as source_cover:
    cover = source_cover.convert("RGB")
    cover.save(OUTPUT / "cover.png", optimize=True)
    resized(cover, (1200, 630)).save(OUTPUT / "og-cover.png", optimize=True)

# La ilustración de la portada: un recorte sin fondo que se apoya directamente
# sobre la crema de la página. Se sale en WebP porque el PNG pesa 1,7 MB y
# cuantizarlo a paleta deja bandas en el degradado del resplandor.
with Image.open(SOURCE / "ilustracion.png") as source_art:
    art = source_art.convert("RGBA")

    # El original trae un margen transparente ancho; recortarlo evita que la
    # maquetación tenga que compensar un hueco que no se ve.
    art = art.crop(art.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())

    width = 1280
    height = round(art.height * width / art.width)
    resized(art, (width, height)).save(
        OUTPUT / "ilustracion.webp", format="WEBP", quality=86, method=6
    )
