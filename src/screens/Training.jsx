// Training — interval ear trainer. Hear two notes, name the interval. Pick which
// intervals to drill, the direction (up / down / together), and the speed; it
// synthesizes the tones with Web Audio. Settings persist on-device.
import React, { useState, useRef, useEffect } from 'react';
import { SegmentedControl, Switch, Icon } from '../components/index.js';
import { loadTraining, saveTraining } from '../lib/storage.js';

const INTERVALS = [
  { s: 1, short: 'm2', name: 'Minor 2nd' },
  { s: 2, short: 'M2', name: 'Major 2nd' },
  { s: 3, short: 'm3', name: 'Minor 3rd' },
  { s: 4, short: 'M3', name: 'Major 3rd' },
  { s: 5, short: 'P4', name: 'Perfect 4th' },
  { s: 6, short: 'TT', name: 'Tritone' },
  { s: 7, short: 'P5', name: 'Perfect 5th' },
  { s: 8, short: 'm6', name: 'Minor 6th' },
  { s: 9, short: 'M6', name: 'Major 6th' },
  { s: 10, short: 'm7', name: 'Minor 7th' },
  { s: 11, short: 'M7', name: 'Major 7th' },
  { s: 12, short: 'P8', name: 'Octave' },
];
const PRESETS = [
  { label: 'Simple', semis: [4, 7, 12] },
  { label: 'Diatonic', semis: [2, 4, 5, 7, 9, 11, 12] },
  { label: 'All', semis: INTERVALS.map((i) => i.s) },
];
const SPEED = { slow: { dur: 0.85, gap: 0.3 }, medium: { dur: 0.55, gap: 0.18 }, fast: { dur: 0.4, gap: 0.08 } };
const nameOf = (s) => (INTERVALS.find((i) => i.s === s) || {}).name || '';
const sameSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

export function Training() {
  const saved = loadTraining() || {};
  const [enabled, setEnabled] = useState(() => (Array.isArray(saved.enabled) && saved.enabled.length ? saved.enabled : [4, 7, 12]));
  const [direction, setDirection] = useState(saved.direction || 'asc'); // asc | desc | both | harmonic
  const [speed, setSpeed] = useState(SPEED[saved.speed] ? saved.speed : 'medium');
  const [fixedRoot, setFixedRoot] = useState(!!saved.fixedRoot);
  const [autoAdvance, setAutoAdvance] = useState(!!saved.autoAdvance);

  const [current, setCurrent] = useState(null); // { s, root, dir }
  const [answered, setAnswered] = useState(null); // { chosen }
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);

  const ac = useRef(null);
  const advanceTimer = useRef(null);
  const voices = useRef([]);   // live oscillators, so a new question can cut off the previous one
  const lastS = useRef(null);  // last interval, to avoid immediate repeats
  const latest = useRef({});

  useEffect(() => { saveTraining({ enabled, direction, speed, fixedRoot, autoAdvance }); }, [enabled, direction, speed, fixedRoot, autoAdvance]);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); if (ac.current) { try { ac.current.close(); } catch { /* closed */ } } }, []);

  const audio = () => { if (!ac.current) ac.current = new (window.AudioContext || window.webkitAudioContext)(); if (ac.current.resume) ac.current.resume(); return ac.current; };
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const tone = (freq, start, dur) => {
    const ctx = ac.current;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
    g.gain.setValueAtTime(0.2, start + Math.max(0.05, dur - 0.09));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(ctx.destination);
    const voice = { osc, g };
    voices.current.push(voice);
    osc.onended = () => { voices.current = voices.current.filter((v) => v !== voice); };
    osc.start(start); osc.stop(start + dur + 0.03);
  };
  // Cut any still-sounding tones (with a quick fade to avoid a click) so rapid
  // Play / Hear-again taps don't stack into a clipping chord.
  const stopVoices = () => {
    const ctx = ac.current; if (!ctx) return;
    const now = ctx.currentTime;
    for (const { osc, g } of voices.current) {
      try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.02); } catch { /* ignore */ }
      try { osc.stop(now + 0.03); } catch { /* already stopped */ }
    }
    voices.current = [];
  };
  const playInterval = (q) => {
    const ctx = audio(); stopVoices(); const t0 = ctx.currentTime + 0.06; const sp = SPEED[speed];
    if (q.dir === 'harmonic') {
      const dur = sp.dur * 1.7;
      tone(midiToFreq(q.root), t0, dur);
      tone(midiToFreq(q.root + q.s), t0, dur);
    } else {
      const second = q.dir === 'desc' ? q.root - q.s : q.root + q.s;
      tone(midiToFreq(q.root), t0, sp.dur);
      tone(midiToFreq(second), t0 + sp.dur + sp.gap, sp.dur);
    }
  };
  const genQuestion = () => {
    const pool = enabled;
    let s;
    do { s = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && s === lastS.current);
    lastS.current = s;
    const dir = direction === 'both' ? (Math.random() < 0.5 ? 'asc' : 'desc') : direction;
    const root = fixedRoot ? 60 : 57 + Math.floor(Math.random() * 8); // C4 fixed, else A3–E4
    // Freeze the answer options with the question so changing the pool mid-question
    // can't hide the correct answer.
    const opts = INTERVALS.filter((i) => pool.includes(i.s));
    return { s, root, dir, opts };
  };

  const play = () => {
    if (enabled.length < 2) return;
    if (advanceTimer.current) { clearTimeout(advanceTimer.current); advanceTimer.current = null; }
    const q = genQuestion();
    setCurrent(q); setAnswered(null);
    playInterval(q);
  };
  const replay = () => { if (current) playInterval(current); };
  const choose = (s) => {
    if (!current || answered) return;
    const ok = s === current.s;
    setAnswered({ chosen: s });
    setScore((v) => ({ correct: v.correct + (ok ? 1 : 0), total: v.total + 1 }));
    setStreak((v) => (ok ? v + 1 : 0));
    if (ok && autoAdvance) advanceTimer.current = setTimeout(() => play(), 900);
  };
  const resetScore = () => { setScore({ correct: 0, total: 0 }); setStreak(0); };

  // Keyboard: space plays / replays / advances; number keys pick a choice.
  latest.current = { current, answered, enabled, play, replay, choose };
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const L = latest.current;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!L.current || L.answered) L.play(); else L.replay();
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && L.current && !L.answered) {
        const choices = L.current.opts || INTERVALS.filter((i) => L.enabled.includes(i.s));
        if (choices[n - 1]) L.choose(choices[n - 1].s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choices = current ? current.opts : INTERVALS.filter((i) => enabled.includes(i.s));
  const toggleInterval = (s) => setEnabled((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]).sort((a, b) => a - b));
  const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <div className="screen tr">
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Ear training</div>
        <h1 className="screen-title">Interval trainer</h1>
        <p className="screen-lead">Hear two notes and name the interval between them. A few minutes a day trains your ear fast.</p>
      </div>

      <div className="tr-quiz">
        <div className="tr-scorebar">
          <span className="tr-score"><b>{score.correct}</b> of {score.total}{score.total ? ` · ${pct}%` : ''}</span>
          {streak >= 2 && <span className="tr-streak">{streak} in a row</span>}
          {score.total > 0 && <button className="tr-reset" onClick={resetScore}>Reset</button>}
        </div>

        <button className={'tr-play' + (current ? ' tr-play--again' : '')} onClick={current ? replay : play} disabled={enabled.length < 2}>
          <Icon n={current ? 'rotate-ccw' : 'play'} s={22} />{current ? 'Hear again' : 'Play interval'}
        </button>
        {enabled.length < 2 && <div className="tr-warn">Enable at least two intervals below to start.</div>}

        {current && (
          <>
            <div className="tr-choices">
              {choices.map((iv, i) => {
                const state = answered ? (iv.s === current.s ? ' is-correct' : (iv.s === answered.chosen ? ' is-wrong' : ' is-dim')) : '';
                return (
                  <button key={iv.s} className={'tr-choice' + state} disabled={!!answered} onClick={() => choose(iv.s)}>
                    {i < 9 && <span className="tr-choice-key" aria-hidden="true">{i + 1}</span>}{iv.name}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div className="tr-feedback">
                {answered.chosen === current.s
                  ? <span className="tr-fb tr-fb--ok"><Icon n="check" s={16} />Correct — {nameOf(current.s)}</span>
                  : <span className="tr-fb tr-fb--no"><Icon n="x" s={16} />That was {nameOf(current.s)}</span>}
                {!autoAdvance && <button className="tr-next" onClick={play}>Next<Icon n="skip-forward" s={16} /></button>}
              </div>
            )}
          </>
        )}
        <div className="tr-kbhint">Space to play or replay · number keys to answer</div>
      </div>

      <div className="tr-settings">
        <div className="tr-set-block">
          <div className="fc-eyebrow tr-set-h">Intervals</div>
          <div className="tr-presets">
            {PRESETS.map((p) => (
              <button key={p.label} className={'tr-preset' + (sameSet(enabled, p.semis) ? ' on' : '')} onClick={() => setEnabled([...p.semis])}>{p.label}</button>
            ))}
          </div>
          <div className="tr-ivgrid">
            {INTERVALS.map((iv) => (
              <button key={iv.s} className={'tr-iv' + (enabled.includes(iv.s) ? ' on' : '')} onClick={() => toggleInterval(iv.s)} aria-pressed={enabled.includes(iv.s)}>
                <span className="tr-iv-short">{iv.short}</span><span className="tr-iv-name">{iv.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="tr-set-row">
          <div className="tr-set-item">
            <div className="fc-eyebrow tr-set-h">Direction</div>
            <SegmentedControl
              options={[{ value: 'asc', label: 'Up' }, { value: 'desc', label: 'Down' }, { value: 'both', label: 'Both' }, { value: 'harmonic', label: 'Together' }]}
              value={direction} onChange={setDirection} />
          </div>
          <div className="tr-set-item">
            <div className="fc-eyebrow tr-set-h">Speed</div>
            <SegmentedControl
              options={[{ value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Medium' }, { value: 'fast', label: 'Fast' }]}
              value={speed} onChange={setSpeed} />
          </div>
        </div>

        <div className="tr-toggles">
          <Switch checked={fixedRoot} onChange={() => setFixedRoot((v) => !v)} label="Fixed root — start every interval on the same note" />
          <Switch checked={autoAdvance} onChange={() => setAutoAdvance((v) => !v)} label="Auto-advance after a correct answer" />
        </div>
      </div>
    </div>
  );
}
