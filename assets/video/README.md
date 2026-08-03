# Butler Grok video clips (2.5D / “fake 3D”)

Place finished clips **here** (`assets/video/`). The app loads them automatically; if a file is missing it falls back to the still photo.

## Required files

| File | Duration | Loop? | Trigger |
|------|----------|-------|---------|
| `butler-idle-breathe.mp4` | 6s | yes | Random idle (every ~3–5 min) |
| `butler-idle-look.mp4` | 6s | yes | Random idle — look L/R, back to center |
| `butler-idle-watch.mp4` | 10s | yes | Random idle — pocket watch out & back |
| `butler-speak.mp4` | 6s | yes | Leo / Butler speaking |
| `butler-listen.mp4` | 6s | yes | User Speak / listening |
| `butler-welcome.mp4` | 6s | no | App start + return after 15 min quiet |
| `butler-point.mp4` | 6s | no | Opening a home panel |
| `butler-think.mp4` | 6s | yes | Chat thinking / busy |

Optional WebM copies (same basename) are also tried: e.g. `butler-speak.webm`.

## Seamless loop rule

**Start pose ≈ end pose** (same feet, body angle, framing).  
Camera fixed. One simple action only.

## Generate with Grok `/imagine-video`

1. Use the matching still as the **first frame** (paths under `assets/`):

| Clip | Source still |
|------|----------------|
| idle-breathe, idle-look, idle-watch | `butler-idle.jpg` |
| speak | `butler-speak-open.jpg` |
| listen | `butler-listen.jpg` |
| welcome | `butler-welcome.jpg` |
| point | `butler-point.jpg` |
| think | `butler-think.jpg` |

2. Ask for **6s or 10s**, highest quality available (720p or 1080p if offered).
3. Copy the result into this folder with the **exact names** above.

### Prompts (copy-paste)

**idle-breathe (6s, loop)**  
`Seamless loop from this exact pose: the butler breathes gently with tiny natural sway, then returns to the exact starting pose and framing. Fixed camera, full body, no walk, no cut.`

**idle-look (6s, loop)**  
`Seamless loop: from this pose the butler slowly looks left, then right as if searching the room, then returns head and eyes to face the camera in the exact starting pose. Body planted, fixed camera.`

**idle-watch (10s, loop)**  
`Seamless loop: from this pose the butler pulls a gold pocket watch from his waistcoat, glances at the time, tucks it away, and returns hands and body to the exact starting pose. Fixed camera, single continuous action.`

**speak (6s, loop)**  
`Seamless loop: the butler talks naturally with mouth and slight head motion as if speaking politely; ends in the same standing pose as the first frame. Fixed camera, warm expression.`

**listen (6s, loop)**  
`Seamless loop: the butler keeps a hand lightly cupped near his ear, leans in a little as if listening carefully, with small attentive micro-movements; ends matching the start pose. Fixed camera.`

**welcome (6s, once)**  
`From this greeting pose the butler gives a slight polite bow with arms open welcoming, then eases back toward the same open-arms smile as the first frame. Fixed camera, warm and friendly.`

**point (6s, once)**  
`From this pointing pose the butler holds the point toward the side with a short confident emphasis, then settles back into the same pointing stance as the first frame. Fixed camera.`

**think (6s, loop)**  
`Seamless loop: the butler thinks with hand near chin, slight contemplative head tilt and breathing; returns to the exact starting pose. Fixed camera.`

## Tips

- Prefer **one motion per clip** (video models struggle with multi-step chaos).
- Keep the **golden curtain + full-body framing** consistent with the stills.
- After dropping files, restart or hard-refresh the app so Vite/Electron picks them up.
