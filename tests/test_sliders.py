"""The slider ceiling against a stand-in for Forge's UiLoadsave: ui-config.json's maximum is applied first, then ours."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib_resolution_plus import defaults, sliders  # noqa: E402


class Slider:
    def __init__(self, elem_id, value=1024, minimum=64, maximum=4096):
        self.elem_id = elem_id
        self.value = value
        self.minimum = minimum
        self.maximum = maximum


def make_loadsave(saved):
    class UiLoadsave:
        def __init__(self):
            self.ui_settings = dict(saved)

        def add_component(self, path, x):
            # what Forge does: the saved maximum overwrites the one the slider was built with
            key = f"{path}/maximum"
            if key in self.ui_settings:
                x.maximum = self.ui_settings[key]
            else:
                self.ui_settings[key] = x.maximum

    return UiLoadsave


def test_cap_wins_over_ui_config():
    cls = make_loadsave({"txt2img/Width/maximum": 2048})
    assert sliders.install(cls, lambda: 8192)
    loadsave = cls()
    width = Slider("txt2img_width")
    loadsave.add_component("txt2img/Width", width)
    assert width.maximum == 8192
    # ui-config.json keeps what it had: turning the extension off gives the old slider back
    assert loadsave.ui_settings["txt2img/Width/maximum"] == 2048


def test_other_components_untouched():
    cls = make_loadsave({"txt2img/Batch size/maximum": 8})
    sliders.install(cls, lambda: 8192)
    batch = Slider("txt2img_batch_size", value=1, minimum=1, maximum=8)
    cls().add_component("txt2img/Batch size", batch)
    assert batch.maximum == 8


def test_zero_leaves_forge_alone():
    cls = make_loadsave({"img2img/Height/maximum": 2048})
    sliders.install(cls, lambda: 0)
    height = Slider("img2img_height", maximum=2048)
    cls().add_component("img2img/Height", height)
    assert height.maximum == 2048


def test_lower_cap_brings_the_value_down():
    s = Slider("txt2img_height", value=3072)
    assert sliders.apply_cap(s, 2048)
    assert (s.maximum, s.value) == (2048, 2048)


def test_cap_never_under_minimum():
    s = Slider("txt2img_width", value=512, minimum=512)
    sliders.apply_cap(s, 256)
    assert s.maximum == 512


def test_bad_cap_is_ignored():
    s = Slider("txt2img_width", maximum=2048)
    assert not sliders.apply_cap(s, "lots")
    assert s.maximum == 2048


def test_install_once():
    cls = make_loadsave({})
    assert sliders.install(cls, lambda: 8192)
    assert not sliders.install(cls, lambda: 4096)
    width = Slider("txt2img_width")
    cls().add_component("txt2img/Width", width)
    assert width.maximum == 8192


def test_a_failing_cap_does_not_break_the_ui():
    cls = make_loadsave({"txt2img/Width/maximum": 2048})

    def broken():
        raise RuntimeError("no opts yet")

    sliders.install(cls, broken)
    width = Slider("txt2img_width")
    cls().add_component("txt2img/Width", width)
    assert width.maximum == 2048


def test_presets_start_from_aspect_ratio_plus():
    mine = "> Portrait 2:3\n1024 x 1536"
    assert defaults.initial_presets({"arp_presets": mine}) == mine
    assert defaults.initial_presets({"arp_presets": "  "}) == defaults.PRESETS
    assert defaults.initial_presets(None) == defaults.PRESETS
