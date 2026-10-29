"""Original vector mark: ravine banks form M, a source point starts two ripples."""
import math
from common import COLORS as C

def mark_body(phase=0.0, color=None):
    ink=color or C['ink']; water=color or C['ice']
    # Sine/cosine modulation is periodic: no duplicated final frame or jump.
    wave=math.sin(2*math.pi*phase)
    swell=(1-math.cos(2*math.pi*phase))/2
    return (f'<g id="ravine" fill="{ink}"><path d="M5 22V7h8l11 11L35 7h8v15h-7v-6L24 28 12 16v6Z"/></g>'
        f'<circle id="source" cx="24" cy="29.5" r="2.1" fill="{water}"/>'
        f'<g id="ripple-inner" transform="translate(24 34) scale({1+.035*wave:.6f} {1+.06*wave:.6f}) translate(-24 -34)" '
        f'fill="none" stroke="{water}" stroke-width="2.6" stroke-linecap="round">'
        '<path d="M21 33.5C9 34.5 12 38.5 24 38.5S39 34.5 27 33.5"/></g>'
        f'<g id="ripple-outer" transform="translate(24 37) scale({1+.025*swell:.6f} {1+.07*swell:.6f}) translate(-24 -37)" '
        f'opacity="{1-.14*swell:.6f}" fill="none" stroke="{ink}" stroke-width="3.4" stroke-linecap="round">'
        '<path d="M17 31.5C-1 33-1 43.5 24 43.5S49 33 31 31.5"/></g>')
