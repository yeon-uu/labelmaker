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
   * strip: 기존 긴 스트립 가로 라벨. square: 정사각, 여러 줄 텍스트 중앙 배치.
   */
  const LABEL_SIZES = {
    strip: { width: 280, height: 100 },
    square: { width: 160, height: 160 }
  };

  /**
   * 라벨을 Canvas에 그린다.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts
   *   opts.tokens: 토큰 배열
   *   opts.tapeColor: 테이프 색 hex
   *   opts.fontFamily: 폰트 이름
   *   opts.textColor: 텍스트 색 (기본 --text)
   *   opts.size: 'strip' | 'square' (지정 시 width/height 자동 결정, 직접 지정한 width/height가 있으면 그것이 우선)
   *   opts.scale: 렌더 배율 (다운로드 시 3배)
   *   opts.width, opts.height: 표시 크기(px, scale 적용 전)
   *   opts.radius: 라벨 모서리 radius (기본 3px, 거의 직각)
   */
  const INK = '#3A3330';

  async function drawLabel(canvas, opts) {
    const sizePreset = LABEL_SIZES[opts.size] || LABEL_SIZES.strip;
    const {
      tokens = [],
      tapeColor = '#FFFFFF',
      fontFamily = 'Jua',
      textColor = '#5B4A3F',
      frame = 'none',
      scale = 1,
      width = sizePreset.width,
      height = sizePreset.height,
      radius = 3
    } = opts;

    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scale, scale);

    // 폰트 로드 확인
    const fontSize = 22;
    try {
      await document.fonts.load(`${fontSize}px ${fontFamily}`);
    } catch (e) {
      // 폰트 로드 실패해도 폴백 폰트로 진행
    }

    const isInvert = frame === 'invert';
    // 반전 프레임: 라벨 전체를 잉크색으로 채우고 글자·글리프는 테이프색으로 그린다.
    const inkColor = isInvert ? tapeColor : INK;
    const contentColor = isInvert ? tapeColor : textColor;

    // 라벨 배경: 실물 라벨 텍스처(assets/label-texture.png) 클리핑 후 그 위에 테이프색을 곱연산톤으로 겹침.
    // invert 프레임은 텍스처 대신 잉크색 단색 채움(반전 표현 유지).
    drawRoundedRect(ctx, 0, 0, width, height, radius);
    ctx.save();
    ctx.clip();
    if (isInvert) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, width, height);
    } else {
      const tex = await loadLabelTexture();
      if (tex) {
        // 텍스처를 라벨 크기에 맞춰 스트레치(cover 방식: 텍스처 비율 유지하며 채움)
        drawTextureCover(ctx, tex, width, height);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      }
      // 테이프 색 틴트: 화이트가 아니면 텍스처 위에 반투명 색 레이어를 곱해 은은하게 물들인다
      if (tapeColor.toUpperCase() !== '#FFFFFF') {
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = tapeColor;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    // 프레임 테두리 (배경 위, 텍스트 아래)
    drawFrame(ctx, frame, width, height, radius, inkColor);

    // 텍스트+글리프 토큰을 한 줄로 배치 (중앙 정렬, 필요시 줄바꿈)
    ctx.fillStyle = contentColor;
    ctx.font = `${fontSize}px "${fontFamily}", sans-serif`;
    ctx.textBaseline = 'middle';
    // 잉크 번짐: 인쇄된 라벨(Canvas 출력)에만 미세 blur (LCD 미리보기는 별도 DOM이라 영향 없음)
    ctx.shadowColor = contentColor;
    ctx.shadowBlur = 0.3;

    const glyphSize = fontSize;
    const paddingX = 20;
    const maxWidth = width - paddingX * 2;

    // 토큰을 렌더 가능한 조각(문자 또는 glyph) 단위로 펼침
    const pieces = [];
    for (const tok of tokens) {
      if (tok.type === 'text') {
        for (const ch of tok.value) {
          pieces.push({ type: 'char', value: ch });
        }
      } else if (tok.type === 'glyph') {
        pieces.push({ type: 'glyph', id: tok.id });
      }
    }

    // 줄바꿈 계산
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;
    for (const piece of pieces) {
      const w = piece.type === 'char' ? ctx.measureText(piece.value).width : glyphSize + 6;
      if (currentWidth + w > maxWidth && currentLine.length > 0) {
        lines.push({ pieces: currentLine, width: currentWidth });
        currentLine = [];
        currentWidth = 0;
      }
      currentLine.push(piece);
      currentWidth += w;
    }
    if (currentLine.length > 0) lines.push({ pieces: currentLine, width: currentWidth });
    if (lines.length === 0) lines.push({ pieces: [], width: 0 });

    const lineHeight = fontSize * 1.5;
    const totalHeight = lines.length * lineHeight;
    let y = height / 2 - totalHeight / 2 + lineHeight / 2;

    // 글리프 이미지 캐시 로드 (필요한 것만). 반전 프레임에서는 테이프색 글리프를 별도 로드.
    const neededGlyphIds = new Set(pieces.filter(p => p.type === 'glyph').map(p => p.id));
    const glyphImages = {};
    for (const id of neededGlyphIds) {
      glyphImages[id] = await loadGlyphImage(id, contentColor);
    }

    for (const line of lines) {
      let x = width / 2 - line.width / 2;
      for (const piece of line.pieces) {
        if (piece.type === 'char') {
          ctx.fillText(piece.value, x, y);
          x += ctx.measureText(piece.value).width;
        } else {
          const img = glyphImages[piece.id];
          if (img) {
            ctx.drawImage(img, x, y - glyphSize / 2, glyphSize, glyphSize);
          }
          x += glyphSize + 6;
        }
      }
    }

    ctx.restore();
  }

  // 실물 라벨 텍스처 이미지 로드 (1회만, 캐시)
  let _labelTexturePromise = null;
  function loadLabelTexture() {
    if (_labelTexturePromise) return _labelTexturePromise;
    _labelTexturePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'assets/label-texture.png';
    });
    return _labelTexturePromise;
  }

  // 텍스처를 대상 사각형에 'cover' 방식으로 그린다 (비율 유지, 넘치는 부분은 잘림)
  function drawTextureCover(ctx, img, w, h) {
    const srcRatio = img.width / img.height;
    const dstRatio = w / h;
    let sx, sy, sw, sh;
    if (srcRatio > dstRatio) {
      // 원본이 더 넓음 -> 좌우를 자름
      sh = img.height;
      sw = sh * dstRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // 원본이 더 좁음/높음 -> 상하를 자름
      sw = img.width;
      sh = sw / dstRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
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
