"""Soft UI taps for the cursor presses: a felt body, a short tone and a breath of noise.
Usage: python tap.py <out_dir>   -> tap-a.wav, tap-b.wav, tap-c.wav (three slight pitch variations)
"""
import sys
from pathlib import Path

import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
SR=48000; rng=np.random.default_rng(3)
def make(pitch, out):
    n=int(0.25*SR); t=np.arange(n)/SR
    body=np.sin(2*np.pi*190*pitch*t)*np.exp(-t/0.012)*0.6
    tone=np.sin(2*np.pi*1750*pitch*t)*np.exp(-t/0.018)*0.22 + np.sin(2*np.pi*3500*pitch*t)*np.exp(-t/0.008)*0.06
    nz=sosfilt(butter(2,[1200,5000],'band',fs=SR,output='sos'), rng.standard_normal(n))*np.exp(-t/0.0025)*0.25
    x=(body+tone+nz)*np.minimum(1,t/0.0015)
    x=sosfilt(butter(2,6500,'low',fs=SR,output='sos'),x)
    x=x/np.max(np.abs(x))*0.5
    st=np.stack([x, np.concatenate([np.zeros(12), x[:-12]])],1)
    sf.write(out, st.astype(np.float32), SR, subtype='PCM_24')
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
out.mkdir(parents=True, exist_ok=True)
for i, p in enumerate([1.0, 0.94, 1.06]):
    make(p, out / f'tap-{"abc"[i]}.wav')
