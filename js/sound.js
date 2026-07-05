/**
 * sound.js — Web Audio API 자체 합성 사운드 (외부 파일/라이브러리 없음)
 *
 * 노출: window.LabelSound
 *   .init()               — 최초 사용자 상호작용 시 1회 호출 (AudioContext 생성 + resume)
 *   .playKey(opts)         — 키 입력음 ("톡" 소리)
 *   .playPrintStart()      — 출력 시작 스윕음
 *   .playPrintRattle(steps)— 인쇄 중 "드르륵" 노이즈 버스트 (steps회 반복, 감김 리듬과 동기화)
 *   .setMuted(bool)        — 음소거 토글, localStorage에 저장
 *   .isMuted()             — 현재 음소거 상태
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'labelmaker:muted';
  const BASE_VOLUME = 0.12; // 낮은 기본 볼륨

  let ctx = null;
  let masterGain = null;
  let muted = false;

  try {
    muted = localStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) {
    muted = false;
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AudioContextCtor = global.AudioContext || global.webkitAudioContext;
    if (!AudioContextCtor) return null;
    ctx = new AudioContextCtor();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : BASE_VOLUME;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function init() {
    const c = ensureContext();
    if (c && c.state === 'suspended') {
      c.resume().catch(() => {});
    }
  }

  function setMuted(next) {
    muted = !!next;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (e) {
      /* localStorage 사용 불가 환경 — 상태만 메모리에 유지 */
    }
    if (masterGain) {
      masterGain.gain.value = muted ? 0 : BASE_VOLUME;
    }
  }

  function isMuted() {
    return muted;
  }

  /**
   * 키 입력음: sine/triangle 오실레이터, attack 5ms / release 40ms 엔벨로프.
   * baseFreq 기준 ±10~15% 랜덤 편차. 전체 40~80ms 감쇠.
   */
  function playKey(opts) {
    const c = ensureContext();
    if (!c || muted) return;
    const { baseFreq = 750, type = 'sine', duration = 0.06 } = opts || {};

    const now = c.currentTime;
    const deviation = 1 + (Math.random() * 0.25 - 0.125); // ±12.5% 근사(10~15% 범위 내)
    const freq = baseFreq * deviation;

    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const gain = c.createGain();
    const attack = 0.005;
    const release = 0.04;
    const total = Math.max(duration, attack + release);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + attack);
    gain.gain.linearRampToValueAtTime(0, now + total);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + total + 0.02);
  }

  /** 일반 자모 키 (600~900Hz 대역에서 랜덤) */
  function playKeyNormal() {
    const baseFreq = 600 + Math.random() * 300;
    playKey({ baseFreq, type: 'sine', duration: 0.05 });
  }

  /** 스페이스/지우기 키 (더 낮은 톤, 400Hz대) */
  function playKeyLow() {
    const baseFreq = 380 + Math.random() * 60;
    playKey({ baseFreq, type: 'triangle', duration: 0.07 });
  }

  /**
   * 핑크 버튼 전용 "딸깍" 클릭음: 아주 짧은 저음 클릭(펄스 하나 + 즉시 감쇠).
   * 일반 키음(sine 600~900Hz)과 구분되는 딱딱한 톤 — square wave 짧은 펄스.
   */
  function playClick() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;
    const dur = 0.03;

    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.002);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  /**
   * 출력 시작음: 낮은 주파수에서 살짝 올라가는 짧은 스윕 (100~200ms).
   */
  function playPrintStart() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;
    const dur = 0.16;

    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(220, now + dur);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.9, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // 화이트노이즈 버퍼 캐시 (짧은 버스트용)
  let _noiseBuffer = null;
  function getNoiseBuffer() {
    if (_noiseBuffer) return _noiseBuffer;
    const c = ensureContext();
    if (!c) return null;
    const length = Math.floor(c.sampleRate * 0.08);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    _noiseBuffer = buffer;
    return buffer;
  }

  /** 노이즈 버스트 1회 (짧게 게이팅한 화이트노이즈 틱) */
  function playRattleTick() {
    const c = ensureContext();
    if (!c || muted) return;
    const buffer = getNoiseBuffer();
    if (!buffer) return;
    const now = c.currentTime;

    const src = c.createBufferSource();
    src.buffer = buffer;

    // 저음 톤을 살짝 섞어 "드르륵" 질감 보강
    const lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1200;

    const gain = c.createGain();
    const dur = 0.05;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.004);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    src.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(masterGain);
    src.start(now);
    src.stop(now + dur + 0.01);
  }

  /**
   * 인쇄 중 "드르륵" 사운드: 짧은 노이즈 버스트를 steps회 반복 재생.
   * 감김 애니메이션의 6~8단계 리듬과 같은 간격으로 호출되도록,
   * 호출부(app.js)가 setTimeout으로 각 스텝마다 이 함수를 부른다.
   */
  function playPrintRattle(steps) {
    const n = steps || 7;
    for (let i = 0; i < n; i++) {
      // 즉시 재생용 단발 함수 — 반복 타이밍은 호출부에서 제어
      playRattleTick();
    }
  }

  /** 단일 스텝용 (app.js가 각 keyframe 퍼센트 타이밍에 맞춰 호출) */
  function playPrintRattleStep() {
    playRattleTick();
  }

  global.LabelSound = {
    init,
    playKey: playKeyNormal,
    playKeyLow,
    playClick,
    playPrintStart,
    playPrintRattle,
    playPrintRattleStep,
    setMuted,
    isMuted
  };
})(typeof window !== 'undefined' ? window : globalThis);
