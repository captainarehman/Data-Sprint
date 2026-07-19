# Data Sprint — Vidyalankar Polytechnic × Siemens

Three files, one job each:

- **index.html** — structure & content
- **style.css** — every color, font, size, and animation state
- **script.js** — orbit motion, the click sequence, and the synthesized sound effects
- **assets/images/** — the 8 orbit icons you supplied, plus placeholder graphics for the 3 slots you customize

Open `index.html` directly in a browser to preview it (double-click works fine — no server or build step needed).

## Things you'll likely want to swap in

**The two logo boxes on the opening screen** (top-left / top-right)
In `index.html`, find `corner-logo--left` and `corner-logo--right`. Replace the `<img src="...">` with your own file (drop it into `assets/images/`), and adjust the size with the `--box-w` value right on that same element, e.g. `style="--box-w: 180px;"`.

**The image above the "Data Sprint" button**
Same pattern — look for `final-banner` in `index.html`, swap the image, adjust `--box-w`.

**The QR code**
Find `id="qr-img"` on the register screen and point its `src` at your real QR image (PNG or SVG both work). The current one is a stylized placeholder pattern, not a working code — swap it before the event.

**Colors**
All in one place at the top of `style.css`, under `:root`. `--cyan-core` / `--cyan-soft` are the light-blue accents, `--bg-void` / `--bg-base` / `--bg-panel` are the dark-navy layers.

**Timing** (how fast it spins up, how long the convergence takes, etc.)
The `TIMING` object near the bottom of `script.js` — everything's in milliseconds and matches the "3–4 second convergence" you asked for by default.

**Event details on the register screen**
Right now it's just the title and QR code, as agreed. If you want a date/time/venue line later, add a `<p>` under `.register-title` in `index.html` and style it off `.register-sub`.

## A couple of honest notes

- **Font:** Siemens' real typeface (Siemens Sans) is proprietary, so this uses **Titillium Web** for headings/buttons — a free, geometric sans with a similar clean, technical feel — paired with **Inter** for smaller text. Both load from Google Fonts, so an internet connection is needed the first time a visitor opens the page; after that they're cached.
- **Sound:** every effect (the ambient hum, the activation whoosh, the glitch blip, the register chime) is generated in code via the Web Audio API — no audio files to manage. Browsers block audible autoplay before any interaction, so the sound engine starts the instant that's allowed and unlocks itself on the very first tap — in practice that's the same tap that starts the sequence, so it feels instant. There's a small mute icon in the bottom-right corner.
- Tested with no scrollbar from a 375px-wide phone up through a 2560px display.
