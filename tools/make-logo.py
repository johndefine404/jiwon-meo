"""[Define404] 지원냥 로고: 부킹냥(booking-meo)과 같은 고양이 머리 도형에 초록 바탕과 작은 편지 봉투를 얹는다.
사용: python3 tools/make-logo.py   → public/logo.svg, public/favicon.svg
메일 머리글용 PNG(public/logo-email.png)는 브라우저로 logo.svg 를 96px 로 찍어 만든다(README 참고).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W = H = 120
BRAND = "#1F6B4F"
WHITE = "#FFFFFF"
INNER = "#FFB6A3"
DARK = "#1B1F1D"
WHISKER = "#D3DBD6"

# 고양이 머리 도형 (booking-meo/tools/make-mascot.py 와 같은 값)
EAR_L = [(27, 56), (33, 20), (55, 42)]
EAR_R = [(93, 56), (87, 20), (65, 42)]
IN_L = [(34, 48), (36, 30), (48, 42)]
IN_R = [(86, 48), (84, 30), (72, 42)]
HEAD = (60, 68, 80, 66)
EYES = [(46, 67, 9, 11), (74, 67, 9, 11)]
NOSE = [(56, 75), (64, 75), (60, 80)]
MOUTH = [[(60, 80), (55, 84)], [(60, 80), (65, 84)]]
WHISKERS = [[(24, 74), (40, 76)], [(25, 82), (40, 80)], [(96, 74), (80, 76)], [(95, 82), (80, 80)]]

# 지원냥만의 표시: 오른쪽 아래 작은 편지 봉투 (매주 오는 메일)
ENV = (78, 86, 26, 18)  # x, y, w, h


def pts(p):
    return " ".join(f"{x},{y}" for x, y in p)


def cat(whiskers=True):
    parts = [
        f'<polygon points="{pts(EAR_L)}" fill="{WHITE}"/>',
        f'<polygon points="{pts(IN_L)}" fill="{INNER}"/>',
        f'<polygon points="{pts(EAR_R)}" fill="{WHITE}"/>',
        f'<polygon points="{pts(IN_R)}" fill="{INNER}"/>',
        f'<ellipse cx="{HEAD[0]}" cy="{HEAD[1]}" rx="{HEAD[2] / 2}" ry="{HEAD[3] / 2}" fill="{WHITE}"/>',
    ]
    parts += [f'<ellipse cx="{x}" cy="{y}" rx="{w / 2}" ry="{h / 2}" fill="{DARK}"/>' for x, y, w, h in EYES]
    parts.append(f'<polygon points="{pts(NOSE)}" fill="{INNER}"/>')
    parts += [f'<polyline points="{pts(m)}" fill="none" stroke="{DARK}" stroke-width="2" stroke-linecap="round"/>' for m in MOUTH]
    if whiskers:
        parts += [f'<polyline points="{pts(w)}" fill="none" stroke="{WHISKER}" stroke-width="2" stroke-linecap="round"/>' for w in WHISKERS]
    return "".join(parts)


def envelope():
    x, y, w, h = ENV
    flap = pts([(x + 2, y + 2), (x + w / 2, y + h * 0.58), (x + w - 2, y + 2)])
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="{WHITE}" stroke="{BRAND}" stroke-width="3"/>'
            f'<polyline points="{flap}" fill="none" stroke="{BRAND}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>')


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{body}</svg>\n'


(ROOT / "public" / "logo.svg").write_text(svg(f'<circle cx="60" cy="60" r="60" fill="{BRAND}"/>{cat()}{envelope()}'))
# 파비콘은 16px 에서도 읽히게 수염과 봉투를 뺀다
(ROOT / "public" / "favicon.svg").write_text(svg(f'<circle cx="60" cy="60" r="60" fill="{BRAND}"/>{cat(whiskers=False)}'))
print("ok")
