"""Chrono film score: an original felt-piano + pad cue, 100 BPM, D-flat major, written to picture.

Every sound is synthesised here (no samples), so the cue is ours outright.
Usage: python compose.py <out_dir>   -> score_full.wav (+ stems)
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
GAIN_PADS = 0.3     # bus balance (RMS, 12–30 s): piano ~-24, arp ~-28, pads ~-29, sub ~-30 dB RMS
GAIN_LOW = 0.25
LEN = 61.0
N = int(SR * LEN)
BPM = 100
BEAT = 60 / BPM          # 0.6 s
BAR = 4 * BEAT           # 2.4 s
rng = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x, axis=0)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)


def stereo(x, pan):
    """Equal-power pan, pan in [-1, 1]."""
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def add(bus, sig, t):
    i = int(round(t * SR))
    if i >= len(bus):
        return
    j = min(len(bus), i + len(sig))
    bus[i:j] += sig[: j - i]


# ---------------------------------------------------------------- instruments
def piano(m, vel=0.5, ring=None, damp=1.0):
    """Felt piano: inharmonic partials, two-stage decay, soft hammer, velocity-dependent brightness."""
    f0 = hz(m)
    ring = ring if ring is not None else float(np.interp(m, [36, 60, 84], [7.0, 4.5, 2.4])) * damp
    n = int(SR * (ring + 0.6))
    t = np.arange(n) / SR
    out = np.zeros(n)
    B = 0.00035
    bright = 0.55 + 0.9 * vel
    for k in range(1, 15):
        fk = f0 * k * np.sqrt(1 + B * k * k)
        if fk > 9000:
            break
        amp = (1 / k ** (2.1 - bright)) * (1 if k == 1 else 0.85)
        tk = ring / (1 + 0.55 * (k - 1))                 # higher partials die sooner
        env = 0.65 * np.exp(-t / (tk * 0.22)) + 0.35 * np.exp(-t / tk)
        det = 1 + rng.uniform(-0.6, 0.6) * 1e-3 / k     # unison strings beating gently
        ph = rng.uniform(0, 2 * np.pi)
        out += amp * env * (np.sin(2 * np.pi * fk * t + ph) + 0.6 * np.sin(2 * np.pi * fk * det * t + ph * 1.3))
    atk = 0.006 + 0.01 * (1 - vel)
    out *= np.minimum(1, t / atk)
    # felt: soften the attack transient
    out = lp(out, 1800 + 5200 * vel)
    # hammer thump
    th = int(0.04 * SR)
    thump = lp(rng.standard_normal(th), 900) * np.exp(-np.arange(th) / (0.008 * SR)) * 0.25 * vel
    out[:th] += thump
    # release tail fade
    rel = int(0.5 * SR)
    out[-rel:] *= np.linspace(1, 0, rel) ** 2
    return out * vel / 6


def pad_chord(notes, dur, attack=1.4, release=1.8, cutoff=1400, bright=0.0):
    """Warm analogue-style pad: detuned band-limited saws, slow filter breath."""
    n = int(SR * (dur + release))
    t = np.arange(n) / SR
    L = np.zeros(n)
    R = np.zeros(n)
    for m in notes:
        f0 = hz(m)
        for d, pan in ((-7, -0.6), (0, 0.0), (7, 0.6)):
            f = f0 * 2 ** (d / 1200)
            ph = rng.uniform(0, 2 * np.pi)
            s = np.zeros(n)
            for k in range(1, 40):
                if f * k > 5000:
                    break
                s += np.sin(2 * np.pi * f * k * t + ph * k) / k
            g = stereo(s, pan)
            L += g[:, 0]
            R += g[:, 1]
    x = np.stack([L, R], axis=1)
    x = lp(x, cutoff * (1 + bright), order=4)
    env = np.minimum(1, t / attack) ** 1.6
    rel_i = int(dur * SR)
    tail = np.ones(n)
    tail[rel_i:] = np.cos(np.linspace(0, np.pi / 2, n - rel_i)) ** 2
    x *= (env * tail)[:, None]
    return x / (len(notes) * 9)


def sub(m, dur, attack=0.25, release=1.2):
    n = int(SR * (dur + release))
    t = np.arange(n) / SR
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t)
    env = np.minimum(1, t / attack)
    rel_i = int(dur * SR)
    env[rel_i:] *= np.cos(np.linspace(0, np.pi / 2, n - rel_i)) ** 2
    return s * env * 0.22


def tick(pitch=1.0, vel=0.5):
    """Wooden clock tick: a tuned resonant click."""
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * 2300 * pitch * t) * np.exp(-t / 0.006)
         + 0.6 * np.sin(2 * np.pi * 1150 * pitch * t) * np.exp(-t / 0.014)
         + 0.3 * bp(rng.standard_normal(n), 2500, 7000) * np.exp(-t / 0.002))
    return s * vel * 0.12


def air(dur, lo=5000, hi=12000):
    n = int(SR * dur)
    x = rng.standard_normal((n, 2))
    x = bp(x, lo, hi)
    t = np.arange(n) / SR
    env = np.sin(np.pi * t / dur) ** 2
    return x * env[:, None] * 0.012


# ---------------------------------------------------------------- reverb
def make_ir(seconds=3.4, predelay=0.022):
    n = int(SR * seconds)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for c in range(2):
        noise = rng.standard_normal(n)
        lo = lp(noise, 1200) * np.exp(-t / (seconds / 5.0))
        mid = bp(noise, 1200, 4000) * np.exp(-t / (seconds / 7.5))
        hi = hp(noise, 4000) * np.exp(-t / (seconds / 14))
        ir[:, c] = lo + 0.7 * mid + 0.35 * hi
    ir *= np.minimum(1, t / 0.03)[:, None]
    # early reflections
    for d, g in ((0.011, 0.5), (0.019, 0.35), (0.027, 0.28), (0.041, 0.2)):
        ir[int(d * SR), 0] += g
        ir[int((d + 0.003) * SR), 1] += g
    pd = np.zeros((int(predelay * SR), 2))
    ir = np.vstack([pd, ir])
    return ir / np.sqrt((ir ** 2).sum() / 2)


def reverb(x, ir):
    out = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return out


# ---------------------------------------------------------------- harmony
C = {
    'Db':    dict(pad=[49, 56, 63, 65, 72], bass=37),           # Dbmaj9
    'Bbm':   dict(pad=[53, 61, 65, 68, 72], bass=34),           # Bbm9
    'Gb':    dict(pad=[54, 58, 61, 65, 68], bass=42),           # Gbmaj9 (no root dup)
    'Absus': dict(pad=[56, 61, 63, 66, 70], bass=44),           # Ab7sus4 (Ab Db Eb Gb Bb)
    'Ab':    dict(pad=[56, 60, 63, 66, 70], bass=44),           # Ab9
    'DbF':   dict(pad=[53, 56, 61, 63, 68], bass=41),           # Db/F
    'Ebm':   dict(pad=[51, 58, 61, 65, 66], bass=39),           # Ebm9
}
ARP = {  # chord tones for the arpeggio, low to high
    'Db':    [56, 61, 63, 65, 68, 72, 73, 77],
    'Bbm':   [53, 58, 61, 65, 68, 72, 73, 77],
    'Gb':    [54, 58, 61, 65, 66, 70, 73, 77],
    'Absus': [56, 61, 63, 66, 68, 70, 73, 75],
    'Ab':    [56, 60, 63, 66, 68, 72, 75, 80],
    'DbF':   [53, 56, 61, 63, 65, 68, 73, 75],
    'Ebm':   [51, 58, 61, 63, 66, 70, 73, 75],
}
# (bar index, chord, bars long)
PLAN = [
    (0, 'Db', 2), (2, 'Bbm', 1), (3, 'Gb', 0.5), (3.5, 'Absus', 0.5),
    (4, 'Db', 1), (5, 'Bbm', 1), (6, 'Gb', 1), (7, 'Absus', 0.5), (7.5, 'Ab', 0.5),
    (8, 'Db', 1), (9, 'Bbm', 1),
    (10, 'Gb', 1), (11, 'DbF', 1), (12, 'Absus', 29.89 / BAR - 12), (29.89 / BAR, 'Ab', 13 - 29.89 / BAR),
    (13, 'Bbm', 1), (14, 'Gb', 1), (15, 'Ab', 1),
    (16, 'Db', 1), (17, 'Ebm', 1), (18, 'Gb', 1), (19, 'Absus', 0.5), (19.5, 'Ab', 0.5),
]


def bar_t(b):
    return b * BAR


def main(outdir):
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    pno = np.zeros((N, 2))      # piano (melody + chords)
    arp = np.zeros((N, 2))
    pads = np.zeros((N, 2))
    low = np.zeros((N, 2))
    tex = np.zeros((N, 2))

    # ---- pads + sub following the plan
    for b, ch, length in PLAN:
        t0 = bar_t(b)
        d = length * BAR
        bright = 0.35 if 9.6 <= t0 < 38.4 else (0.6 if 31.2 <= t0 < 38.4 else 0.0)
        if 31.2 <= t0 < 38.4:
            bright = 0.7
        cut = 1100 if t0 < 9.6 else (1500 if t0 < 38.4 else 2000)
        att = 2.6 if t0 == 0 else 0.5
        add(pads, pad_chord(C[ch]['pad'], d + 0.15, attack=att, release=1.6, cutoff=cut, bright=bright), t0)
        if t0 >= 2.0:
            add(low, stereo(sub(C[ch]['bass'], d, attack=0.35 if t0 < 9.6 else 0.12), 0), t0)

    # ---- intro: the mark completes (~2.05 s), the name rises (2.35), the tag (2.75)
    add(low, stereo(sub(37, 3.0, attack=0.35), 0) * 1.2, 2.0)
    add(pno, stereo(piano(37, 0.42, ring=6), -0.1), 2.05)
    add(pno, stereo(piano(49, 0.38, ring=6), 0.0), 2.06)
    add(pno, stereo(piano(68, 0.42), 0.25), 2.38)
    add(pno, stereo(piano(75, 0.38), 0.35), 2.78)
    add(pno, stereo(piano(77, 0.34), 0.3), 3.6)
    # clock: a soft tick-tock on the beat through the open and the question
    for i in range(1, 16):
        t = i * BEAT
        if t > 9.3:
            break
        fade = min(1, t / 1.8) * (1 if t < 7.8 else max(0, (9.3 - t) / 1.5))
        add(tex, stereo(tick(1.0 if i % 2 else 0.84, 0.55 * fade), 0.35 if i % 2 else -0.35), t)

    # ---- hook (5.1 line one, 6.5 line two, unresolved at the sus)
    hook = [(5.12, 73, 0.46), (5.42, 72, 0.32), (5.72, 68, 0.36), (6.52, 70, 0.44), (6.82, 68, 0.32),
            (7.2, 65, 0.4), (7.8, 66, 0.3), (8.4, 63, 0.38)]
    for t, m, v in hook:
        add(pno, stereo(piano(m, v), 0.15), t)

    # ---- arpeggio (pulse) from the watch page on
    def chord_at(t):
        cur = 'Db'
        for b, ch, _ in PLAN:
            if bar_t(b) <= t + 1e-6:
                cur = ch
        return cur

    pattern = [0, 2, 4, 5, 3, 4, 6, 4]
    t = 9.6
    step_i = 0
    while t < 48.0 - 1e-6:
        sixteenth = 31.2 <= t < 38.4
        step = BEAT / 4 if sixteenth else BEAT / 2
        ch = chord_at(t)
        tones = ARP[ch]
        m = tones[pattern[step_i % 8] % len(tones)]
        if sixteenth and step_i % 2:
            m = tones[(pattern[(step_i // 2) % 8] + 2) % len(tones)]
        accent = 1.0 if (step_i % (8 if sixteenth else 4)) == 0 else 0.78
        v = 0.2 * accent * (0.85 if sixteenth else 1.0)
        if 38.4 <= t < 48:       # lighter for the playlist / badge
            v *= 0.82
        # gentle entry ramp
        v *= min(1, 0.35 + (t - 9.6) / 3.0)
        pan = 0.45 * np.sin(step_i * 0.9)
        add(arp, stereo(piano(m, v, damp=0.35), pan), t)
        t += step
        step_i += 1

    # ---- melody (sparse, long notes)
    mel = [
        (4, 0, 77, .44), (4, 2.5, 75, .34), (5, 0, 73, .42), (5, 2.5, 72, .32),
        (6, 0, 70, .40), (6, 2, 73, .34), (6, 3, 77, .36), (7, 0, 75, .42), (7, 2, 72, .36),
        (8, 0, 77, .46), (8, 1.5, 80, .38), (8, 2.5, 77, .34), (9, 0, 73, .42), (9, 2.5, 72, .34),
        (10, 0, 73, .44), (10, 2, 77, .38), (11, 0, 80, .46), (11, 2.5, 77, .36),
        (12, 0, 75, .44), (12, 2, 73, .36),
        (16, 0, 77, .40), (16, 2.5, 80, .32), (17, 0, 78, .38), (17, 2.5, 75, .30),
        (18, 0, 77, .38), (18, 2, 73, .30), (19, 0, 75, .36), (19, 2.5, 72, .32),
    ]
    for b, beat, m, v in mel:
        add(pno, stereo(piano(m, v), 0.12), bar_t(b) + beat * BEAT)
    # the target applies: resolve the sus with a bright Ab9 voicing on the click
    for m, v, dt in ((44, .4, 0), (68, .42, 0.01), (72, .44, 0.02), (75, .40, 0.03), (80, .36, 0.04)):
        add(pno, stereo(piano(m, v), 0.1), 29.89 + dt)
    # past 2x: each + press climbs a scale step
    for t, m in zip([34.27, 34.92, 35.57, 36.22, 36.87], [72, 73, 75, 77, 80]):
        add(pno, stereo(piano(m, 0.44), 0.2), t)
    add(pno, stereo(piano(84, 0.36), 0.25), 37.5)

    # ---- privacy: three chords on the three claims, then the held dominant
    claims = [(48.7, 'Bbm', .44), (49.35, 'Gb', .42), (50.0, 'Absus', .46)]
    for t, ch, v in claims:
        for k, m in enumerate(C[ch]['pad'][1:] + [C[ch]['bass'] + 12]):
            add(pno, stereo(piano(m, v * 0.8, ring=5), -0.2 + 0.1 * k), t + 0.012 * k)
        add(low, stereo(sub(C[ch]['bass'], 0.65 if t < 50 else 3.2), 0), t)
    add(pads, pad_chord(C['Bbm']['pad'], 0.65, attack=0.3, release=0.8, cutoff=1000), 48.7)
    add(pads, pad_chord(C['Gb']['pad'], 0.65, attack=0.3, release=0.8, cutoff=1000), 49.35)
    add(pads, pad_chord(C['Absus']['pad'], 3.2, attack=0.4, release=0.5, cutoff=1300), 50.0)
    add(pno, stereo(piano(68, 0.32), 0.3), 50.8)
    # reverse swell into the resolution at 53.2
    sw = piano(65, 0.5, ring=3.0) + piano(72, 0.45, ring=3.0)
    sw = reverb(stereo(sw, 0), make_ir(2.2))[: int(2.4 * SR)][::-1]
    sw *= np.linspace(0, 1, len(sw))[:, None] ** 1.5
    add(tex, sw * 0.9, 53.2 - len(sw) / SR)

    # ---- end card: Dbmaj9, wide and warm, rings out
    end = [(37, .5), (49, .46), (56, .42), (60, .40), (63, .40), (65, .42), (72, .38)]
    for k, (m, v) in enumerate(end):
        add(pno, stereo(piano(m, v, ring=8), -0.3 + 0.1 * k), 53.2 + 0.014 * k)
    add(pads, pad_chord(C['Db']['pad'] + [37 + 24], 6.2, attack=0.9, release=1.6, cutoff=1500), 53.2)
    add(low, stereo(sub(37, 5.6, attack=0.05), 0) * 1.25, 53.2)
    add(pno, stereo(piano(77, 0.34, ring=4), 0.3), 53.72)
    add(pno, stereo(piano(80, 0.30, ring=4), 0.35), 54.02)
    add(pno, stereo(piano(84, 0.26, ring=5), 0.4), 54.72)

    # ---- air: subtle shimmer on the section changes
    for t, d in ((0.0, 5.0), (9.0, 3.5), (31.0, 3.0), (38.0, 3.0), (52.0, 4.0)):
        add(tex, air(d), t)

    # ---- mix
    ir = make_ir(3.4)
    ir_long = make_ir(4.6, 0.03)
    wet_p = reverb(pno, ir)
    wet_a = reverb(arp, ir)
    wet_pad = reverb(pads, ir_long)
    buses = {
        'piano': 1.0 * pno + 0.45 * wet_p,
        'arp': 0.8 * arp + 0.5 * wet_a,
        'pads': GAIN_PADS * (pads + 0.6 * wet_pad),
        'low': GAIN_LOW * low,
        'tex': 1.0 * tex + 0.2 * reverb(tex, ir),
    }
    sel = slice(int(12 * SR), int(30 * SR))
    for k, v in buses.items():
        r = np.sqrt(np.mean(v[sel] ** 2)) + 1e-12
        print(f'{k:6s} rms {20*np.log10(r):6.1f} dB')
    mix = sum(buses.values())
    mix = hp(mix, 28, order=4)
    # tame mud a touch
    mix -= 0.18 * bp(mix, 220, 420)
    # glue: gentle soft clip on peaks only
    peak = np.max(np.abs(mix))
    mix = mix / peak * 0.7
    # program fades: in from 0, out to silence by 61 s
    t = np.arange(N) / SR
    fade = np.ones(N)
    fade *= np.clip(t / 0.25, 0, 1)
    fo0 = 57.6
    fade *= np.where(t > fo0, np.cos(np.clip((t - fo0) / (LEN - fo0), 0, 1) * np.pi / 2) ** 2, 1)
    mix *= fade[:, None]

    sf.write(outdir / 'score_full.wav', mix.astype(np.float32), SR, subtype='PCM_24')
    for name, x in (('stem_piano', pno), ('stem_arp', arp), ('stem_pads', pads), ('stem_low', low), ('stem_tex', tex)):
        sf.write(outdir / f'{name}.wav', (x / (np.max(np.abs(x)) + 1e-9) * 0.7).astype(np.float32), SR, subtype='PCM_24')
    print('wrote', outdir / 'score_full.wav')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'out')
