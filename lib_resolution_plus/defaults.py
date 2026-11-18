"""Default settings. The preset list starts from the one Aspect Ratio+ (sd-aspect-ratio-plus) keeps in config.json, when
there is one, since both use the same text format."""

from __future__ import annotations

ARP_PRESETS_KEY = "arp_presets"

MAX = 8192
RATIOS = "1:1, 2:3, 3:4, 4:5, 9:16, 9:21"
TIERS = "1, 2, 4, 8, 16"

# one group per ratio; the popup puts portrait sizes on the left and landscape ones on the right by itself
PRESETS = """> 1:1
1024 x 1024
1536 x 1536
2048 x 2048

> SDXL
640 x 1536
768 x 1344
832 x 1216
896 x 1152
1536 x 640
1344 x 768
1216 x 832
1152 x 896

> 2:3
1024 x 1536
1536 x 1024

> 9:16
768 x 1344
1344 x 768"""


def initial_presets(config: dict | None) -> str:
    """The user's Aspect Ratio+ list when config.json has one, otherwise the list above."""
    value = (config or {}).get(ARP_PRESETS_KEY)
    if isinstance(value, str) and value.strip():
        return value
    return PRESETS
