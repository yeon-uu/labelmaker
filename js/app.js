/**
 * app.js — 상태 관리 + 키보드 렌더 + LCD 동기화 + 출력 플로우
 */
(function () {
  'use strict';

  const { HangulComposer } = window.Hangul;

  // --------------------------------------------------------------------
  // 글리프 정의: id -> { label, useId(svg <use> 참조용) }
  // 실제 SVG 마크업은 index.html의 <defs>에 있고, 렌더/다운로드용으로
  // 여기서 standalone SVG 문자열을 구성해 window.Glyphs에 채워 넣는다.
  // --------------------------------------------------------------------
  const GLYPH_LIST = [
    { id: 'bear', label: '곰 얼굴' },
    { id: 'strawberry', label: '딸기' },
    { id: 'clover', label: '네잎클로버' },
    { id: 'heart', label: '하트' },
    { id: 'sparkle', label: '반짝이' },
    { id: 'ribbon', label: '리본' },
    { id: 'mug', label: '머그컵' },
    { id: 'star', label: '별' },
    { id: 'cloud', label: '구름' },
    { id: 'note', label: '음표' }
  ];

  // <defs> 안의 <g id="glyph-xxx">를 그대로 가져와 standalone svg로 감싼 문자열 생성
  // (Canvas Image 로드 및 인라인 표시 공용)
  window.Glyphs = {};
  function buildGlyphSvgStrings() {
    for (const g of GLYPH_LIST) {
      const source = document.getElementById('glyph-' + g.id);
      if (!source) continue;
      const inner = source.innerHTML;
      // currentColor -> 실제 텍스트 색으로 고정 (Image로 로드되면 currentColor가 검정으로 뜨는 것 방지)
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><g style="color:#5B4A3F">${inner}</g></svg>`;
      window.Glyphs[g.id] = svgStr;
    }
  }

  // --------------------------------------------------------------------
  // 두벌식 키보드 레이아웃
  // --------------------------------------------------------------------
  const KB_ROWS_NORMAL = [
    ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'],
    ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
    ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']
  ];
  const KB_ROWS_SHIFT = [
    ['ㅃ', 'ㅉ', 'ㄸ', 'ㄲ', 'ㅆ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅒ', 'ㅖ'],
    ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
    ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']
  ];

  // --------------------------------------------------------------------
  // 상태
  // --------------------------------------------------------------------
  const state = {
    tokens: [],              // { type:'text', value:string } | { type:'glyph', id:string }
    composer: new HangulComposer(),
    shift: false,
    selectedGlyph: null,
    font: 'Jua',
    tape: '#FFFFFF',
    frame: 'none',
    isPrinting: false
  };

  // --------------------------------------------------------------------
  // 기호 팔레트: 일반 텍스트로 삽입되는 유니코드 문자 (글리프 SVG와 별개)
  // --------------------------------------------------------------------
  const SYMBOL_LIST = ['♡', '♥', '☆', '★', '✧', '✦', '₊', '˚', '·', '＊', '✿', '❀', '⌒', '〜', '♪', '♬', '◠', '‿', '°', '｡'];
  const SYMBOL_COMBOS = ['·˚₊✧', '♡*+·', '☆.。.:*', '(◠‿◠)'];

  // 마지막 텍스트 토큰을 가져오거나 새로 만든다
  function getOrCreateLastTextToken() {
    const last = state.tokens[state.tokens.length - 1];
    if (last && last.type === 'text') return last;
    const tok = { type: 'text', value: '' };
    state.tokens.push(tok);
    return tok;
  }

  // 조합 중인 글자를 반영해 LCD/토큰을 재계산하기 위한 헬퍼:
  // tokens 맨 뒤 text 토큰의 "확정된 부분" 뒤에 조합 중 글자를 붙여서 렌더링만 하고,
  // 실제 committed 문자만 토큰에 영구 반영한다.
  function commitChar(ch) {
    if (!ch) return;
    const tok = getOrCreateLastTextToken();
    tok.value += ch;
  }

  function removeLastChar() {
    // 토큰 배열의 맨 끝에서 한 글자(또는 글리프 하나) 제거
    const last = state.tokens[state.tokens.length - 1];
    if (!last) return;
    if (last.type === 'glyph') {
      state.tokens.pop();
      return;
    }
    if (last.type === 'text') {
      if (last.value.length > 0) {
        last.value = last.value.slice(0, -1);
      }
      if (last.value.length === 0) {
        state.tokens.pop();
      }
    }
  }

  function insertGlyph(id) {
    // 조합 중이던 글자는 먼저 확정
    flushComposer();
    state.tokens.push({ type: 'glyph', id });
    renderLcd();
  }

  // 기호/콤보 삽입: 조합 중이던 글자를 확정한 뒤 일반 텍스트로 커밋
  function insertSymbolText(str) {
    flushComposer();
    const tok = getOrCreateLastTextToken();
    tok.value += str;
    renderLcd();
  }

  function flushComposer() {
    const committed = state.composer.commit();
    if (committed) commitChar(committed);
  }

  // --------------------------------------------------------------------
  // 온스크린 자모 입력 처리 (HangulComposer 사용)
  // --------------------------------------------------------------------
  function handleJamoInput(jamo) {
    const { committed, current } = state.composer.push(jamo);
    if (committed) commitChar(committed);
    renderLcd(current);
  }

  function handleBackspace() {
    if (!state.composer.isEmpty()) {
      const { current, empty } = state.composer.backspace();
      renderLcd(empty ? '' : current);
      return;
    }
    removeLastChar();
    renderLcd();
  }

  function handleSpace() {
    flushComposer();
    commitChar(' ');
    renderLcd();
  }

  // --------------------------------------------------------------------
  // LCD 렌더링: state.tokens + 현재 조합 중인 글자(composingChar)를 합쳐 표시
  // --------------------------------------------------------------------
  const lcdScreen = document.getElementById('lcdScreen');
  const lcdPlaceholder = document.getElementById('lcdPlaceholder');

  const FRAME_CLASSES = ['frame-solid', 'frame-dashed', 'frame-speech', 'frame-scallop', 'frame-invert'];

  function applyLcdFrame() {
    lcdScreen.classList.remove(...FRAME_CLASSES);
    if (state.frame !== 'none') {
      lcdScreen.classList.add('frame-' + state.frame);
    }
  }

  function renderLcd(composingChar) {
    lcdScreen.innerHTML = '';

    const hasContent = state.tokens.length > 0 || (composingChar && composingChar.length > 0);
    if (!hasContent) {
      const ph = document.createElement('span');
      ph.className = 'lcd-placeholder';
      ph.id = 'lcdPlaceholder';
      ph.textContent = '문구를 입력하세요';
      lcdScreen.appendChild(ph);
      return;
    }

    for (const tok of state.tokens) {
      if (tok.type === 'text') {
        if (tok.value.length === 0) continue;
        const span = document.createElement('span');
        span.textContent = tok.value;
        lcdScreen.appendChild(span);
      } else if (tok.type === 'glyph') {
        lcdScreen.appendChild(makeGlyphIcon(tok.id));
      }
    }

    if (composingChar) {
      const span = document.createElement('span');
      span.textContent = composingChar;
      lcdScreen.appendChild(span);
    }
  }

  function makeGlyphIcon(id) {
    const wrap = document.createElement('span');
    wrap.className = 'lcd-glyph';
    const svgStr = window.Glyphs[id];
    if (svgStr) wrap.innerHTML = svgStr;
    return wrap;
  }

  // --------------------------------------------------------------------
  // 온스크린 키보드 렌더
  // --------------------------------------------------------------------
  const keyboardEl = document.getElementById('keyboard');

  function renderKeyboard() {
    keyboardEl.innerHTML = '';
    const rows = state.shift ? KB_ROWS_SHIFT : KB_ROWS_NORMAL;

    rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      row.forEach((jamo) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kb-key';
        btn.textContent = jamo;
        btn.setAttribute('aria-label', '자모 ' + jamo);
        addPressFeedback(btn);
        btn.addEventListener('click', () => {
          handleJamoInput(jamo);
          focusHiddenInputSilently();
        });
        rowEl.appendChild(btn);
      });
      keyboardEl.appendChild(rowEl);
    });

    // 마지막 행: Shift / Space / Backspace
    const bottomRow = document.createElement('div');
    bottomRow.className = 'kb-row';

    const shiftBtn = document.createElement('button');
    shiftBtn.type = 'button';
    shiftBtn.className = 'kb-key kb-key-wide kb-key-shift' + (state.shift ? ' is-active' : '');
    shiftBtn.textContent = '쌍자음';
    shiftBtn.setAttribute('aria-pressed', String(state.shift));
    addPressFeedback(shiftBtn);
    shiftBtn.addEventListener('click', () => {
      state.shift = !state.shift;
      renderKeyboard();
      focusHiddenInputSilently();
    });

    const spaceBtn = document.createElement('button');
    spaceBtn.type = 'button';
    spaceBtn.className = 'kb-key kb-key-space';
    spaceBtn.textContent = '스페이스';
    addPressFeedback(spaceBtn);
    spaceBtn.addEventListener('click', () => {
      handleSpace();
      focusHiddenInputSilently();
    });

    const backspaceBtn = document.createElement('button');
    backspaceBtn.type = 'button';
    backspaceBtn.className = 'kb-key kb-key-wide';
    backspaceBtn.textContent = '지우기';
    addPressFeedback(backspaceBtn);
    backspaceBtn.addEventListener('click', () => {
      handleBackspace();
      focusHiddenInputSilently();
    });

    bottomRow.appendChild(shiftBtn);
    bottomRow.appendChild(spaceBtn);
    bottomRow.appendChild(backspaceBtn);
    keyboardEl.appendChild(bottomRow);
  }

  function addPressFeedback(btn) {
    btn.addEventListener('pointerdown', () => btn.classList.add('is-pressed'));
    const clear = () => btn.classList.remove('is-pressed');
    btn.addEventListener('pointerup', clear);
    btn.addEventListener('pointerleave', clear);
    btn.addEventListener('pointercancel', clear);
  }

  // --------------------------------------------------------------------
  // 실제 키보드(IME) 입력 — 숨김 input의 compositionupdate/compositionend + input
  // --------------------------------------------------------------------
  const hiddenInput = document.getElementById('hiddenInput');
  let isComposing = false;
  let lastComposedValue = '';

  function focusHiddenInputSilently() {
    // 온스크린 키 클릭 후에도 실제 키보드를 계속 받을 수 있도록 포커스 유지
    hiddenInput.focus({ preventScroll: true });
  }

  hiddenInput.addEventListener('compositionstart', () => {
    isComposing = true;
    lastComposedValue = '';
  });

  hiddenInput.addEventListener('compositionupdate', (e) => {
    lastComposedValue = e.data || '';
    renderLcd(lastComposedValue);
  });

  hiddenInput.addEventListener('compositionend', (e) => {
    isComposing = false;
    const finalChar = e.data || '';
    if (finalChar) commitChar(finalChar);
    hiddenInput.value = '';
    renderLcd();
  });

  hiddenInput.addEventListener('input', () => {
    if (isComposing) return; // composition 중엔 compositionupdate가 처리
    const val = hiddenInput.value;
    if (val === '') return;
    // 조합 없는 입력(영문, 숫자, 문장부호, 붙여넣기 등)을 그대로 커밋
    for (const ch of val) {
      if (ch === '\b') continue;
      commitChar(ch);
    }
    hiddenInput.value = '';
    renderLcd();
  });

  hiddenInput.addEventListener('keydown', (e) => {
    if (isComposing) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === ' ') {
      e.preventDefault();
      handleSpace();
    }
  });

  // 페이지 어디를 클릭하든(키/버튼 제외) 숨김 input에 포커스가 유지되도록
  document.addEventListener('pointerdown', (e) => {
    const target = e.target;
    if (target.closest('.kb-key') || target.closest('button') || target === hiddenInput) return;
    focusHiddenInputSilently();
  });

  // --------------------------------------------------------------------
  // 글리프 팔레트 렌더
  // --------------------------------------------------------------------
  const glyphPaletteEl = document.getElementById('glyphPalette');

  function renderGlyphPalette() {
    glyphPaletteEl.innerHTML = '';
    GLYPH_LIST.forEach((g) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'glyph-btn';
      btn.setAttribute('aria-label', g.label + ' 삽입');
      btn.innerHTML = window.Glyphs[g.id] || '';
      btn.addEventListener('click', () => {
        insertGlyph(g.id);
        focusHiddenInputSilently();
      });
      glyphPaletteEl.appendChild(btn);
    });
  }

  // --------------------------------------------------------------------
  // 기호 팔레트 / 콤보 프리셋 렌더
  // --------------------------------------------------------------------
  const symbolPaletteEl = document.getElementById('symbolPalette');
  const symbolCombosEl = document.getElementById('symbolCombos');

  function renderSymbolPalette() {
    symbolPaletteEl.innerHTML = '';
    SYMBOL_LIST.forEach((sym) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'symbol-btn';
      btn.textContent = sym;
      btn.setAttribute('aria-label', sym + ' 기호 삽입');
      btn.addEventListener('click', () => {
        insertSymbolText(sym);
        focusHiddenInputSilently();
      });
      symbolPaletteEl.appendChild(btn);
    });
  }

  function renderSymbolCombos() {
    symbolCombosEl.innerHTML = '';
    SYMBOL_COMBOS.forEach((combo) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'combo-btn';
      btn.textContent = combo;
      btn.setAttribute('aria-label', combo + ' 콤보 삽입');
      btn.addEventListener('click', () => {
        insertSymbolText(combo);
        focusHiddenInputSilently();
      });
      symbolCombosEl.appendChild(btn);
    });
  }

  // --------------------------------------------------------------------
  // 폰트 / 테이프 색 / 프레임 선택
  // --------------------------------------------------------------------
  const fontOptionsEl = document.getElementById('fontOptions');
  const tapeOptionsEl = document.getElementById('tapeOptions');
  const frameOptionsEl = document.getElementById('frameOptions');

  fontOptionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.option-btn');
    if (!btn) return;
    state.font = btn.dataset.font === 'gothic' ? 'Pretendard, system-ui, sans-serif' : btn.dataset.font;
    [...fontOptionsEl.children].forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  });

  tapeOptionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.tape-swatch');
    if (!btn) return;
    state.tape = btn.dataset.tape;
    [...tapeOptionsEl.children].forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  });

  frameOptionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.frame-swatch');
    if (!btn) return;
    state.frame = btn.dataset.frame;
    [...frameOptionsEl.children].forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    applyLcdFrame();
  });

  // --------------------------------------------------------------------
  // 출력 플로우
  // --------------------------------------------------------------------
  const printBtn = document.getElementById('printBtn');
  const machineBody = document.getElementById('machineBody');
  const labelCanvas = document.getElementById('labelCanvas');
  const labelDownloadBtn = document.getElementById('labelDownloadBtn');
  const toastEl = document.getElementById('toast');

  function hasAnyContent() {
    return state.tokens.some(t => (t.type === 'text' && t.value.trim().length > 0) || t.type === 'glyph');
  }

  printBtn.addEventListener('click', async () => {
    if (state.isPrinting) return;
    flushComposer();
    renderLcd();

    if (!hasAnyContent()) {
      focusHiddenInputSilently();
      return;
    }

    state.isPrinting = true;
    printBtn.disabled = true;

    // 1. 기기 진동
    machineBody.classList.add('is-shaking');
    setTimeout(() => machineBody.classList.remove('is-shaking'), 300);

    // 2. 라벨 Canvas 렌더 (표시용, scale 1)
    labelDownloadBtn.hidden = true;
    labelCanvas.classList.remove('is-printing');
    // 리플로우 유도 후 애니메이션 재적용
    void labelCanvas.offsetWidth;

    await window.LabelRenderer.drawLabel(labelCanvas, {
      tokens: cloneTokens(state.tokens),
      tapeColor: state.tape,
      fontFamily: state.font,
      textColor: '#5B4A3F',
      frame: state.frame,
      scale: 2,
      width: 280,
      height: 100,
      radius: 16
    });

    // 3. 슬라이드 업 애니메이션 (--anim-print)
    requestAnimationFrame(() => {
      labelCanvas.classList.add('is-printing');
    });

    setTimeout(() => {
      showToast();
      labelDownloadBtn.hidden = false;
      state.isPrinting = false;
      printBtn.disabled = false;
    }, 1400);
  });

  function cloneTokens(tokens) {
    return tokens.map(t => ({ ...t }));
  }

  function showToast() {
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('is-visible'));
    setTimeout(() => {
      toastEl.classList.remove('is-visible');
      setTimeout(() => { toastEl.hidden = true; }, 300);
    }, 1800);
  }

  labelDownloadBtn.addEventListener('click', async () => {
    await window.LabelRenderer.downloadLabelPng({
      tokens: cloneTokens(state.tokens),
      tapeColor: state.tape,
      fontFamily: state.font,
      textColor: '#5B4A3F',
      frame: state.frame,
      width: 280,
      height: 100,
      radius: 16
    });
  });

  // --------------------------------------------------------------------
  // 초기화
  // --------------------------------------------------------------------
  function init() {
    buildGlyphSvgStrings();
    renderKeyboard();
    renderGlyphPalette();
    renderSymbolPalette();
    renderSymbolCombos();
    renderLcd();
    focusHiddenInputSilently();
  }

  init();
})();
