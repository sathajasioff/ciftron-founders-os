// Jarvis voice: browser speech recognition in, ElevenLabs (or browser speech) out.
// No transcript is kept or shown.
import { live, api } from './live.js';
import { getLang } from './i18n.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function createVoice({ onState, onLevel, onHeard, onError }) {
  let rec = null, audio = null, ctx = null, analyser = null, raf = 0, muted = false, elevenOk = true;
  const set = (s) => onState && onState(s);

  function listen() {
    stop();
    if (!SR) { onError && onError('This browser cannot listen. Use Chrome, Edge or Safari, or type instead.'); return; }
    rec = new SR();
    rec.lang = getLang() === 'fr' ? 'fr-CA' : 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let heard = false;
    rec.onresult = (e) => { heard = true; const text = e.results[0][0].transcript.trim(); set('thinking'); onHeard && onHeard(text); };
    rec.onerror = (e) => { if (e.error !== 'aborted') onError && onError(e.error === 'not-allowed' ? 'Microphone access is blocked for this site.' : e.error === 'no-speech' ? 'I did not hear anything.' : 'Listening stopped: ' + e.error); set('online'); };
    rec.onend = () => { if (!heard) set('online'); rec = null; };
    rec.start();
    set('listening');
  }

  async function speak(text) {
    if (muted || !text) { set('online'); return; }
    set('speaking');
    if (live.on && elevenOk) {
      try {
        const r = await api('voice', { body: { text } });
        audio = new Audio(`data:${r.type};base64,${r.audio}`);
        meter(audio);
        audio.onended = () => done();
        await audio.play();
        return;
      } catch (e) {
        if (/no characters|key|Add your/i.test(e.message)) elevenOk = false;
      }
    }
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = getLang() === 'fr' ? 'fr-CA' : 'en-US';
      u.rate = 1.03;
      let k = 0; const fake = () => { k += 0.25; onLevel && onLevel(0.35 + Math.abs(Math.sin(k)) * 0.5); raf = requestAnimationFrame(fake); };
      u.onend = () => done(); u.onerror = () => done();
      fake();
      speechSynthesis.speak(u);
    } else done();
  }

  function meter(el) {
    try {
      ctx = ctx || new AudioContext();
      const src = ctx.createMediaElementSource(el);
      analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      src.connect(analyser); analyser.connect(ctx.destination);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => { analyser.getByteFrequencyData(data); onLevel && onLevel(data.reduce((a, b) => a + b, 0) / data.length / 110); raf = requestAnimationFrame(tick); };
      tick();
    } catch { /* level meter is optional */ }
  }

  function done() { cancelAnimationFrame(raf); onLevel && onLevel(0); audio = null; set('online'); }

  function stop() {
    if (rec) { try { rec.abort(); } catch {} rec = null; }
    if (audio) { audio.pause(); audio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    cancelAnimationFrame(raf); onLevel && onLevel(0);
    set('online');
  }

  return { listen, speak, stop, canListen: !!SR, setMuted: (m) => { muted = m; if (m) stop(); }, isMuted: () => muted };
}
