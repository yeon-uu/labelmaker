/**
 * render.js — Canvas 라벨 렌더 (LCD 미리보기용 레이아웃 계산 + PNG 다운로드용 Canvas 렌더)
 *
 * 라벨 내부 상태: tokens = [{ type: 'text', value: string } | { type: 'glyph', id: string }]
 * 외부 노출: LabelRenderer
 */
(function (global) {
  'use strict';

  const GLYPHS = global.Glyphs; // glyphs.js 또는 app.js에서 등록

  /**
   * 라벨 사이즈 2종 (표시 px, scale 적용 전).
   * strip: 가로 폭 고정, 세로는 줄 수에 비례해 늘어나는 영수증형(최소 height만 기본값).
   * square: 정사각 폭 고정, 세로도 정사각을 기본으로 하되 줄이 많으면 늘어남(최소 height=width).
   */
  const LABEL_SIZES = {
    strip: { width: 280, height: 100 },
    square: { width: 160, height: 160 }
  };

  /**
   * 라벨을 Canvas에 그린다. 사진 텍스처(label-texture.png/라벨지모음.png) 방식은 완전히 폐기 —
   * 기울고 배경이 묻어 못 썼다. 이제 라벨은 전부 코드로 직접 그린다:
   * 반듯한 라운드 사각(기울기 0) + 선택된 테이프 단색 배경 + 비닐 코팅 광택 밴드 1줄 +
   * 도트 픽셀폰트(Galmuri11) 텍스트.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts
   *   opts.tokens: 토큰 배열
   *   opts.tapeColor: 테이프 색 hex (라벨 배경 단색)
   *   opts.size: 'strip' | 'square' (지정 시 width/height 자동 결정, 직접 지정한 width/height가 있으면 그것이 우선)
   *   opts.scale: 렌더 배율 (다운로드 시 3배)
   *   opts.width, opts.height: 표시 크기(px, scale 적용 전)
   *   opts.radius: 라벨 모서리 radius (기본 10px, 8~12px 범위)
   *   opts.fontFamily/opts.textColor는 더 이상 사용하지 않음(폰트는 항상 Galmuri11,
   *   잉크색은 항상 #3A3330 고정 — 호출부가 값을 넘겨도 무시된다).
   */
  const INK = '#3A3330';
  // 라벨 출력물 전용 폰트: 도트 픽셀폰트 Galmuri11(LCD와 동일). Jua/Gaegu는 더 이상 쓰지 않는다.
  // 폴백 체인은 LCD와 동일하게 맞춰 로드 실패 시에도 도트/모노스페이스 느낌을 유지한다.
  const LABEL_FONT_STACK = '"Galmuri11", "NeoDunggeunmo", "DungGeunMo", "DotGothic16", monospace';

  // 토큰을 렌더 가능한 조각(문자 또는 glyph) 단위로 펼치되, "어절" 경계(공백/개행 뒤)를
  // 표시해 줄바꿈 계산 시 어절 단위 우선 분리가 가능하게 한다.
  // piece: { type:'char', value, breakable } | { type:'glyph', id, breakable }
  // breakable=true면 이 조각 "다음"에서 줄을 나눌 수 있음(어절 경계). 공백/개행 자체는
  // 항상 그 위치에서 강제 개행(개행) 또는 분리 가능(공백) 지점이 된다.
  function flattenPieces(tokens) {
    const pieces = [];
    for (const tok of tokens) {
      if (tok.type === 'text') {
        for (const ch of tok.value) {
          if (ch === '\n') {
            pieces.push({ type: 'break' });
          } else if (ch === ' ') {
            pieces.push({ type: 'char', value: ch, breakAfter: true });
          } else {
            pieces.push({ type: 'char', value: ch });
          }
        }
      } else if (tok.type === 'glyph') {
        pieces.push({ type: 'glyph', id: tok.id });
      } else if (tok.type === 'emoji') {
        pieces.push({ type: 'emoji', id: tok.id });
      }
    }
    return pieces;
  }

  // 조각 배열을 "어절"(공백/개행으로 구분되는 뭉치) 단위로 묶는다.
  // 각 어절은 자신을 구성하는 pieces와, 그 어절이 강제개행(\n)으로 끝나는지 여부를 갖는다.
  function groupIntoWords(pieces) {
    const words = [];
    let current = [];
    for (const p of pieces) {
      if (p.type === 'break') {
        if (current.length > 0) { words.push({ pieces: current, forceBreak: true }); current = []; }
        else if (words.length > 0) { words[words.length - 1].forceBreak = true; }
        else { words.push({ pieces: [], forceBreak: true }); }
        continue;
      }
      current.push(p);
      if (p.breakAfter) {
        words.push({ pieces: current, forceBreak: false });
        current = [];
      }
    }
    if (current.length > 0) words.push({ pieces: current, forceBreak: false });
    return words;
  }

  function pieceWidth(ctx, piece, glyphSize) {
    return piece.type === 'char' ? ctx.measureText(piece.value).width : glyphSize + 6;
  }

  function wordWidth(ctx, word, glyphSize) {
    let w = 0;
    for (const p of word.pieces) w += pieceWidth(ctx, p, glyphSize);
    return w;
  }

  // 줄바꿈 계산: 어절 단위 우선(공백에서 분리), 어절 하나가 maxWidth를 넘으면 글자 단위로 쪼갠다.
  function layoutLines(ctx, tokens, maxWidth, glyphSize) {
    const pieces = flattenPieces(tokens);
    const words = groupIntoWords(pieces);

    const lines = [];
    let currentPieces = [];
    let currentWidth = 0;

    function pushLine() {
      lines.push({ pieces: currentPieces, width: currentWidth });
      currentPieces = [];
      currentWidth = 0;
    }

    for (const word of words) {
      const wWidth = wordWidth(ctx, word, glyphSize);
      if (word.pieces.length === 0) {
        // 빈 어절(연속 개행 등) — 강제개행만 처리
        if (word.forceBreak) pushLine();
        continue;
      }

      if (wWidth <= maxWidth) {
        // 어절 전체가 폭 안에 들어감: 현재 줄에 들어가는지 확인
        if (currentWidth > 0 && currentWidth + wWidth > maxWidth) {
          pushLine();
        }
        for (const p of word.pieces) currentPieces.push(p);
        currentWidth += wWidth;
      } else {
        // 어절 자체가 한 줄 폭보다 김: 글자 단위로 쪼개서 채운다.
        if (currentWidth > 0) pushLine();
        for (const p of word.pieces) {
          const pw = pieceWidth(ctx, p, glyphSize);
          if (currentWidth > 0 && currentWidth + pw > maxWidth) {
            pushLine();
          }
          currentPieces.push(p);
          currentWidth += pw;
        }
      }

      if (word.forceBreak) pushLine();
    }
    if (currentPieces.length > 0 || lines.length === 0) pushLine();

    return lines;
  }

  /**
   * @returns {Promise<{width:number, height:number}>} 실제로 그려진 라벨의 표시 크기(px, scale 전).
   *   호출부(app.js)가 이 값으로 화면 표시 라벨 엘리먼트의 비율을 맞춘다.
   */
  async function drawLabel(canvas, opts) {
    const sizePreset = LABEL_SIZES[opts.size] || LABEL_SIZES.strip;
    const {
      tokens = [],
      tapeColor = '#FFFFFF',
      frame = 'none',
      scale = 1,
      width = sizePreset.width,
      radius = 10
    } = opts;
    const isSquare = opts.size === 'square';

    // 도트 픽셀폰트 로드 보장 (그리기 전에 반드시 대기 — 폴백 폰트로 그려진 뒤 뒤늦게
    // 폰트가 로드돼 재그리기가 안 되는 문제 방지).
    const fontSize = 22;
    try {
      await document.fonts.load(`${fontSize}px "Galmuri11"`);
    } catch (e) {
      // 로드 실패해도 폴백 체인(NeoDunggeunmo/DungGeunMo)으로 계속 진행
    }

    const isInvert = frame === 'invert';
    // 반전 프레임: 라벨 전체를 잉크색으로 채우고 글자·글리프는 테이프색으로 그린다.
    const inkColor = isInvert ? tapeColor : INK;
    const contentColor = isInvert ? tapeColor : INK;

    const glyphSize = fontSize;
    const paddingX = 20;
    const paddingY = 18;
    const maxWidth = width - paddingX * 2;
    const lineHeight = fontSize * 1.5;

    // 줄 수를 먼저 계산하기 위해 임시 컨텍스트로 폰트를 세팅해 measureText를 쓴다
    // (실제 캔버스 크기는 아직 확정 전이라, 별도 오프스크린 컨텍스트 사용).
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = `${fontSize}px ${LABEL_FONT_STACK}`;
    const lines = layoutLines(measureCtx, tokens, maxWidth, glyphSize);

    // 세로 높이: 줄 수 × 줄높이 + 상하 패딩. 영수증처럼 줄이 많을수록 길어진다.
    // 정사각 사이즈는 "정사각을 기본으로" 하되, 실제 필요한 높이가 정사각 높이(=width)보다
    // 크면(줄이 많으면) 그만큼 늘어난다(폭은 그대로 유지).
    const contentHeight = lines.length * lineHeight + paddingY * 2;
    const minHeight = isSquare ? width : sizePreset.height;
    const height = Math.max(minHeight, contentHeight);

    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scale, scale);

    // 라벨 배경: 사진 텍스처 전부 폐기. 반듯한 라운드 사각(기울기 0) + 선택된 테이프 단색.
    // 라벨 바깥은 clip 밖이라 완전 투명 유지.
    drawRoundedRect(ctx, 0, 0, width, height, radius);
    ctx.save();
    ctx.clip();
    if (isInvert) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = tapeColor;
      ctx.fillRect(0, 0, width, height);
      // 비닐 코팅 광택: 은은한 대각선 하이라이트 밴드 한 줄기(반투명 흰색, 불투명도 ~15%).
      // design-tokens.md 예외 조항에 따라 라벨 출력물에만 허용.
      drawGlossBand(ctx, width, height);
    }
    ctx.restore();

    // 프레임 테두리 (배경 위, 텍스트 아래)
    drawFrame(ctx, frame, width, height, radius, inkColor);

    // 텍스트+글리프 배치 (좌우 중앙 정렬, 상하 패딩 확보한 상태로 위에서부터 줄 단위 배치)
    ctx.fillStyle = contentColor;
    ctx.font = `${fontSize}px ${LABEL_FONT_STACK}`;
    ctx.textBaseline = 'middle';

    const totalHeight = lines.length * lineHeight;
    const startY = Math.max(paddingY, height / 2 - totalHeight / 2);
    let y = startY + lineHeight / 2;

    // 글리프 이미지 캐시 로드 (필요한 것만). 반전 프레임에서는 테이프색 글리프를 별도 로드.
    const allPieces = lines.flatMap(l => l.pieces);
    const neededGlyphIds = new Set(allPieces.filter(p => p.type === 'glyph').map(p => p.id));
    const glyphImages = {};
    for (const id of neededGlyphIds) {
      glyphImages[id] = await loadGlyphImage(id, contentColor);
    }

    // 이모지 스프라이트(assets/emoji/*.png)는 이미 잉크색(#3A3330)으로 고정 틴트된 PNG라
    // 반전 프레임(테이프색으로 그려야 함)에서는 loadEmojiImage(id, contentColor)가
    // 필요 시 색상별 캐시를 만들어 캔버스 합성(source-in)으로 재틴트한다.
    const neededEmojiIds = new Set(allPieces.filter(p => p.type === 'emoji').map(p => p.id));
    const emojiImages = {};
    for (const id of neededEmojiIds) {
      emojiImages[id] = await loadEmojiImage(id, contentColor);
    }

    for (const line of lines) {
      let x = width / 2 - line.width / 2;
      for (const piece of line.pieces) {
        if (piece.type === 'char') {
          ctx.fillText(piece.value, x, y);
          x += ctx.measureText(piece.value).width;
        } else if (piece.type === 'glyph') {
          const img = glyphImages[piece.id];
          if (img) {
            ctx.drawImage(img, x, y - glyphSize / 2, glyphSize, glyphSize);
          }
          x += glyphSize + 6;
        } else if (piece.type === 'emoji') {
          const img = emojiImages[piece.id];
          if (img) {
            ctx.drawImage(img, x, y - glyphSize / 2, glyphSize, glyphSize);
          }
          x += glyphSize + 6;
        }
      }
      y += lineHeight;
    }

    ctx.restore();

    return { width, height, lineCount: lines.length };
  }

  // 비닐 코팅 광택: 라벨을 가로지르는 대각선 하이라이트 밴드 한 줄기.
  // 반투명 흰색 그라데이션(중심 불투명도 약 15%, 양끝 0)으로 과하지 않게.
  // design-tokens.md "대담함은 한 곳" 예외 조항: 라벨 출력물만 이 광택 허용.
  function drawGlossBand(ctx, w, h) {
    const diag = Math.sqrt(w * w + h * h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 8); // 대각선 방향 (-22.5deg)
    const bandHalf = diag * 0.16;
    const grad = ctx.createLinearGradient(0, -bandHalf, 0, bandHalf);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-diag, -bandHalf, diag * 2, bandHalf * 2);
    ctx.restore();
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 글리프 SVG 마크업(id -> svg string)을 Image로 변환해 캐싱.
  // 색상별로 캐시 키를 나눠, 반전 프레임에서 테이프색 글리프도 만들 수 있게 한다.
  const _glyphImageCache = {};
  function loadGlyphImage(id, color) {
    const cacheKey = id + '|' + color;
    if (_glyphImageCache[cacheKey]) return _glyphImageCache[cacheKey];
    const baseSvg = global.Glyphs && global.Glyphs[id];
    if (!baseSvg) return Promise.resolve(null);
    // app.js가 생성한 원본은 color:#5B4A3F로 고정되어 있으므로 요청 색으로 치환
    const svgMarkup = baseSvg.replace(/color:#5B4A3F/, `color:${color}`);
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
    _glyphImageCache[cacheKey] = promise;
    return promise;
  }

  // 이모지 스프라이트(assets/emoji/*.png, PIL로 잉크색 #3A3330 고정 틴트된 PNG)를 Image로
  // 로드해 캐싱. 기본 잉크색(#3A3330) 요청이면 원본 그대로 쓰고, 그 외 색(반전 프레임의
  // 테이프색)이 요청되면 오프스크린 캔버스에서 source-in 합성으로 재틴트한 새 이미지를 만든다.
  const _emojiImageCache = {};
  function loadEmojiImage(id, color) {
    const cacheKey = id + '|' + color;
    if (_emojiImageCache[cacheKey]) return _emojiImageCache[cacheKey];
    const src = (global.EmojiSprites && global.EmojiSprites[id]) || null;
    if (!src) return Promise.resolve(null);

    const promise = new Promise((resolve) => {
      const baseImg = new Image();
      baseImg.onload = () => {
        if (color.toUpperCase() === INK.toUpperCase()) {
          resolve(baseImg);
          return;
        }
        // 재틴트: 오프스크린 캔버스에 원본을 그린 뒤 source-in으로 단색을 덮어씌운다
        // (알파 채널만 유지, 색은 요청 색으로 전부 교체).
        const off = document.createElement('canvas');
        off.width = baseImg.naturalWidth;
        off.height = baseImg.naturalHeight;
        const octx = off.getContext('2d');
        octx.drawImage(baseImg, 0, 0);
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = color;
        octx.fillRect(0, 0, off.width, off.height);
        const tinted = new Image();
        tinted.onload = () => resolve(tinted);
        tinted.onerror = () => resolve(baseImg);
        tinted.src = off.toDataURL('image/png');
      };
      baseImg.onerror = () => resolve(null);
      baseImg.src = src;
    });
    _emojiImageCache[cacheKey] = promise;
    return promise;
  }

  /**
   * 프레임 6종 그리기. 배경 채움 뒤, 텍스트 그리기 전에 호출한다.
   * 라벨 바깥으로는 그리지 않아(라운드 사각 안쪽 기준) 투명 배경을 유지한다.
   */
  function drawFrame(ctx, frame, width, height, radius, color) {
    if (!frame || frame === 'none') return;
    const inset = 6; // 테이프 가장자리와 프레임 사이 여백
    const x = inset, y = inset, w = width - inset * 2, h = height - inset * 2;
    const r = Math.max(0, radius - inset);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    if (frame === 'solid') {
      drawRoundedRect(ctx, x, y, w, h, r);
      ctx.stroke();
    } else if (frame === 'dashed') {
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    } else if (frame === 'speech') {
      drawRoundedRect(ctx, x, y, w, h, r);
      ctx.stroke();
      // 하단 중앙 꼬리 (말풍선)
      const tailW = 14, tailH = 10;
      const tailX = width / 2 - tailW / 2;
      const tailY = y + h;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY - 1);
      ctx.lineTo(tailX + tailW / 2, tailY + tailH);
      ctx.lineTo(tailX + tailW, tailY - 1);
      ctx.stroke();
    } else if (frame === 'scallop') {
      drawScallopBorder(ctx, x, y, w, h, color);
    } else if (frame === 'invert') {
      // 반전은 배경 채움으로 이미 처리됨 (drawLabel에서). 추가 테두리 없음.
    }

    ctx.restore();
  }

  // 스캘럽(물결) 테두리: 사각 둘레를 따라 바깥으로 볼록한 반원을 반복해 그린다.
  function drawScallopBorder(ctx, x, y, w, h, color) {
    const scallopR = 6; // 반원 반지름
    const diameter = scallopR * 2;

    ctx.save();
    ctx.fillStyle = color;

    function drawEdgeScallops(x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const count = Math.max(1, Math.round(len / diameter));
      const step = len / count;
      const ux = dx / len, uy = dy / len; // 진행 방향 단위벡터
      const nx = -uy, ny = ux; // 바깥 방향 법선(둘레가 시계방향이라고 가정)
      for (let i = 0; i < count; i++) {
        const cx = x1 + ux * step * (i + 0.5);
        const cy = y1 + uy * step * (i + 0.5);
        const angle = Math.atan2(uy, ux);
        ctx.beginPath();
        ctx.arc(cx, cy, scallopR, angle + Math.PI, angle, false);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 시계방향 둘레: 상 -> 우 -> 하 -> 좌
    drawEdgeScallops(x, y, x + w, y);
    drawEdgeScallops(x + w, y, x + w, y + h);
    drawEdgeScallops(x + w, y + h, x, y + h);
    drawEdgeScallops(x, y + h, x, y);
    ctx.restore();
  }

  /**
   * PNG 다운로드용: 표시 크기의 3배 해상도로 렌더 후 다운로드 트리거.
   */
  async function downloadLabelPng(opts) {
    const canvas = document.createElement('canvas');
    await drawLabel(canvas, { ...opts, scale: 3 });
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'label.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  global.LabelRenderer = {
    drawLabel,
    downloadLabelPng
  };
})(typeof window !== 'undefined' ? window : globalThis);
