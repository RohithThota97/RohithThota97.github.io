People in the TrustGate 3D hospital (Wards page). All sources are CC0 1.0 (public domain); credit to Quaternius is
appreciated, not required.

body_male.gltf, body_female.gltf
  Bodies: Quaternius "Universal Base Characters" (Standard, free edition, downloaded from itch.io on 13 Nov 2026):
  Superhero_Male_FullBody / Superhero_Female_FullBody (+ eyes, eyebrows). Base-colour textures only, downscaled to
  512 px JPEG and embedded as data URIs.
  Motion: Quaternius "Universal Animation Library" (Standard; mirror github.com/J-Ponzo/gltf-universal-animation-library),
  9 clips (Idle_Loop, Idle_Talking_Loop, Walk_Loop, Walk_Formal_Loop, Sitting_Idle_Loop, Sitting_Talking_Loop, Jog_Fwd_Loop, Sprint_Loop,
  Fixing_Kneeling), retargeted offline onto the base-character skeleton (bone-name map + world-space rotation
  transfer per frame, 30 fps).
hair.gltf
  Hairstyles from the same Universal Base Characters pack: Hair_Buzzed, Hair_SimpleParted, Hair_Beard, Hair_Long,
  Hair_Buns, Hair_BuzzedFemale (512 px JPEG textures embedded).
skins.json
  The dark skin-tone base-colour textures of both bodies (512 px JPEG data URIs), swapped in at runtime.

All files are single ASCII files because dashboard/deploy.py accepts ASCII only. Clothing (lab coat, nurse dress /
scrubs, gown, uniform, hi-vis vest, everyday clothes) is generated at runtime in tg3d_people.js.
