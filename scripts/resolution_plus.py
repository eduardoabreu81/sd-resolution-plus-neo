"""Resolution Plus for Forge Neo: image sizes past 2048, by aspect ratio and megapixels.

This file wires the extension into Forge. The Python side does two things only: it raises the maximum of the Width /
Height sliders (lib_resolution_plus.sliders) and it declares the settings. Everything on screen (ratio lock, megapixel
tiers, presets) lives in javascript/, which reads the settings from Forge's `opts`. Generation is never touched.
"""

import logging
import os
import sys

from modules import script_callbacks, shared

EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if EXT_DIR not in sys.path:
    sys.path.insert(0, EXT_DIR)

from lib_resolution_plus import defaults, sliders  # noqa: E402

logger = logging.getLogger("resolution_plus")

KEY_MAX = "resolution_plus_max"
KEY_RATIOS = "resolution_plus_ratios"
KEY_TIERS = "resolution_plus_tiers"
KEY_PRESETS = "resolution_plus_presets"
KEY_IMG2IMG = "resolution_plus_img2img"
KEY_FREE_UNLOCK = "resolution_plus_tier_keeps_ratio"
KEY_YIELD_RATIO = "resolution_plus_yield_ratio"


def _cap():
    # read straight from the saved data: the option may not be registered yet when the first sliders are built
    return shared.opts.data.get(KEY_MAX, defaults.MAX)


def _install():
    try:
        from modules import ui_loadsave
    except ImportError as exc:
        logger.warning("Resolution Plus: the slider maximum stays as it is (%s)", exc)
        return
    if not hasattr(ui_loadsave, "UiLoadsave") or not hasattr(ui_loadsave.UiLoadsave, "add_component"):
        logger.warning("Resolution Plus: this Forge has no UiLoadsave.add_component; the slider maximum stays as it is")
        return
    sliders.install(ui_loadsave.UiLoadsave, _cap)


def _warn_aspect_ratio_plus():
    try:
        from modules import extensions
        if any(ext.name == "sd-aspect-ratio-plus" for ext in extensions.active()):
            logger.warning("Resolution Plus: sd-aspect-ratio-plus is also on; both add buttons next to Width / Height. "
                           "Turn one of them off in Extensions.")
    except Exception:
        pass


def on_ui_settings():
    import gradio as gr
    from modules.options import OptionInfo, options_section

    options = options_section(("resolution_plus", "Resolution Plus", "ui"), {
        KEY_MAX: OptionInfo(
            defaults.MAX, "Width / Height slider maximum", gr.Slider,
            {"minimum": 0, "maximum": 16384, "step": 64},
        ).info("0 = leave Forge's own maximum (and ui-config.json's); ui-config.json is never written").needs_reload_ui(),
        KEY_RATIOS: OptionInfo(
            defaults.RATIOS, "Aspect ratios",
        ).info("comma-separated, width:height; each one is listed in both orientations (2:3 also gives 3:2)"),
        KEY_TIERS: OptionInfo(
            defaults.TIERS, "Megapixel tiers",
        ).info("comma-separated; 1 MP = 1024 x 1024 pixels; decimals work (1.5)"),
        KEY_PRESETS: OptionInfo(
            defaults.initial_presets(shared.opts.data), "My presets", gr.Textbox, {"lines": 12},
        ).info('">" starts a group, "#" is a comment, one "width x height" per line; same format as Aspect Ratio+, '
               "whose list is used here the first time"),
        KEY_FREE_UNLOCK: OptionInfo(
            True, "With the ratio Off, the megapixel pages of the presets start with the current proportion",
        ).info("with a ratio on, they always start with that ratio"),
        KEY_IMG2IMG: OptionInfo(True, "Show the controls in img2img too (Resize to)").needs_reload_ui(),
        KEY_YIELD_RATIO: OptionInfo(
            True, "With Aspect Ratio Helper (Neo) on, leave the ratio lock and ⇅ to it",
        ).info("hides the Ratio button; presets, megapixel pages, the size line and the slider maximum stay"),
    })
    for key, info in options.items():
        shared.opts.add_option(key, info)


PAGE_KEYS = (KEY_RATIOS, KEY_TIERS, KEY_PRESETS, KEY_FREE_UNLOCK, KEY_YIELD_RATIO)


def on_app_started(_demo, app):
    # the page's `opts` is a copy made when the UI was built: after Apply settings, a browser refresh brings the old
    # values back until Reload UI. The script reads its settings here instead, as they are now.
    def options():
        return {key: getattr(shared.opts, key, None) for key in PAGE_KEYS}

    app.add_api_route("/resolution_plus/options", options, methods=["GET"])


_install()
_warn_aspect_ratio_plus()
script_callbacks.on_ui_settings(on_ui_settings, name="resolution_plus")
script_callbacks.on_app_started(on_app_started, name="resolution_plus")
