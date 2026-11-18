"""The ceiling of Forge's Width / Height sliders.

Forge builds the sliders with its own maximum (4096 in txt2img, 2048 in img2img), and then ui-config.json, a file from
the A1111 days, puts back the maximum it saved the first time (usually 2048). That happens in UiLoadsave.add_component,
after the slider exists, so changing the slider when it is created is undone. The wrapper below runs right after
add_component and sets the maximum chosen in Settings. ui-config.json itself is never written: turn the extension off
and the sliders are what they were.
"""

from __future__ import annotations

import functools
import logging

logger = logging.getLogger("resolution_plus")

SLIDER_IDS = ("txt2img_width", "txt2img_height", "img2img_width", "img2img_height")
MARK = "_resolution_plus"


def apply_cap(component, cap) -> bool:
    """Set the maximum of one of the four size sliders to `cap`; True when the component is one of them.

    A cap of 0 (or nothing) leaves the slider as Forge and ui-config.json made it. The cap never goes under the slider's
    minimum, and a value above the new maximum is brought down to it."""
    if getattr(component, "elem_id", None) not in SLIDER_IDS:
        return False
    try:
        cap = int(cap or 0)
    except (TypeError, ValueError):
        return False
    if cap <= 0:
        return False
    minimum = getattr(component, "minimum", None)
    if isinstance(minimum, (int, float)) and cap < minimum:
        cap = int(minimum)
    component.maximum = cap
    value = getattr(component, "value", None)
    if isinstance(value, (int, float)) and value > cap:
        component.value = cap
    return True


def install(loadsave_cls, get_cap) -> bool:
    """Wrap `loadsave_cls.add_component` so the size sliders get the maximum `get_cap()` returns. Installing twice
    (a reload of the script) wraps once. True when the wrapper was installed now."""
    original = loadsave_cls.add_component
    if getattr(original, MARK, False):
        return False

    @functools.wraps(original)
    def add_component(self, path, x):
        original(self, path, x)
        if getattr(x, "elem_id", None) in SLIDER_IDS:
            try:
                apply_cap(x, get_cap())
            except Exception:  # never in the way of the UI
                logger.exception("Resolution Plus: could not raise the maximum of %s", x.elem_id)

    setattr(add_component, MARK, True)
    loadsave_cls.add_component = add_component
    return True
