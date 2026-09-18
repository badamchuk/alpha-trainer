#!/usr/bin/env python3
"""Генерує іконки додатку «Гарт».

Знак — літера «Г», побудована як ковадло: широка верхня площина й масивна
опора. Гарт — це загартування металу, тож колір іде від розжареного низу
(жовтогарячий) до охололого верху (червоний фірмовий).

Малюємо кодом, а не в редакторі, щоб набір можна було перезібрати після
будь-якої правки: python3 scripts/dev/make-icons.py

Вимоги Android до адаптивної іконки: сам знак має вміщатись у центральні ~66%
полотна, бо система обрізає краї під форму маски.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'assets'

SIZE = 1024
BG = (13, 13, 13, 255)          # Colors.background додатку
HOT = (244, 162, 97, 255)       # Colors.accent — розжарений метал
COOL = (230, 57, 70, 255)       # Colors.primary — той самий червоний, що в UI


def heat_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    """Вертикальний градієнт: зверху охололий, знизу гарячий."""
    grad = Image.new('RGBA', (1, size))
    px = grad.load()
    for y in range(size):
        t = y / (size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
    return grad.resize((size, size))


def mark_mask(size: int, inset: float = 0.0) -> Image.Image:
    """
    Маска знака: «Г» з ковадлоподібною верхньою площиною.

    Координати — частки полотна, щоб знак однаково виглядав у будь-якому розмірі.
    `inset` стискає знак до центру (для адаптивної іконки, де краї обрізають).
    """
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)

    def pt(x: float, y: float) -> tuple[float, float]:
        # стискаємо навколо центру
        x = 0.5 + (x - 0.5) * (1 - inset)
        y = 0.5 + (y - 0.5) * (1 - inset)
        return x * size, y * size

    # Верхня площина — робоча поверхня ковадла: ліворуч рівна, праворуч скошена
    top = [
        pt(0.17, 0.15), pt(0.87, 0.15), pt(0.79, 0.35), pt(0.17, 0.35),
    ]
    d.polygon(top, fill=255)

    # Опора: від площини донизу трохи звужується і розходиться у стопу —
    # силует кованої деталі, що стоїть міцно
    body = [
        pt(0.17, 0.35), pt(0.45, 0.35), pt(0.49, 0.74), pt(0.63, 0.83),
        pt(0.63, 0.90), pt(0.17, 0.90), pt(0.17, 0.83), pt(0.31, 0.74),
    ]
    d.polygon(body, fill=255)
    return mask


def compose(size: int, inset: float, background: bool) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), BG if background else (0, 0, 0, 0))
    grad = heat_gradient(size, COOL, HOT)
    canvas.paste(grad, (0, 0), mark_mask(size, inset))
    return canvas


def main() -> None:
    ASSETS.mkdir(exist_ok=True)

    # 1. Основна іконка: знак на темному тлі
    compose(SIZE, inset=0.10, background=True).save(ASSETS / 'icon.png')

    # 2. Адаптивна іконка Android: тло і передній план окремо.
    #    Знак тиснемо сильніше — краї обрізає маска системи.
    Image.new('RGBA', (SIZE, SIZE), BG).save(ASSETS / 'android-icon-background.png')
    compose(SIZE, inset=0.32, background=False).save(ASSETS / 'android-icon-foreground.png')

    # 3. Монохромна (тема Material You): суцільний білий знак
    mono = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    mono.paste(Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 255)),
               (0, 0), mark_mask(SIZE, inset=0.32))
    mono.save(ASSETS / 'android-icon-monochrome.png')

    # 4. Заставка: знак на тлі, з великим полем навколо
    compose(SIZE, inset=0.30, background=True).save(ASSETS / 'splash-icon.png')

    # 5. Favicon для веб-версії
    compose(SIZE, inset=0.10, background=True).resize((196, 196), Image.LANCZOS) \
        .save(ASSETS / 'favicon.png')

    for name in ('icon', 'android-icon-foreground', 'android-icon-background',
                 'android-icon-monochrome', 'splash-icon', 'favicon'):
        p = ASSETS / f'{name}.png'
        print(f'  {p.relative_to(ROOT)} — {p.stat().st_size // 1024} КБ')


if __name__ == '__main__':
    main()
