/**
 * app.js — "몸체 트림 이미지 + 투명 히트존" 방식.
 * assets/kr_trim.png / assets/en_trim.png는 PIL로 몸체 여백을 완전히 제거한 트림 이미지이며,
 * <img>로 그대로 표시하고 그 위에 position:absolute; inset:0 오버레이를 덮는다.
 * 오버레이 안의 %는 트림 이미지 크기에 항상 정확히 대응하므로 좌표가 구조적으로 어긋나지 않는다.
 *
 * 모든 좌표는 Python PIL 픽셀 스캔(크림 키캡 vs 노란 데크 색 구분, LCD/핑크 색 마스크)으로
 * 트림 이미지(kr_trim.png 1096x792, en_trim.png 1095x790) 기준 0~100%로 재측정했고,
 * 각 키 히트존 중심 픽셀이 실제 키캡 위에 있는지 자동 검산해 100% 통과를 확인했다(스크립트는
 * 1회성 도구라 저장하지 않음, 결과는 docs/DEVLOG.md 참고). kr/en 두 챠시는 오벌/행 위치가
 * %로 사실상 동일함을 크롭 비교로 재확인해 R1/R5는 공용 좌표를 사용한다.
 *
 * 2026-07-05(12차) — kr_trim.png를 새 소스 이미지(assets/한글머신오류고침.png)로 교체.
 * 알파채널 없는 RGB라 배경색(크림) 거리 기반으로 몸체 bbox를 트림(1109x794, 기존 1096x792과
 * 유사 크기). R1~R5 좌표 전부 이 새 이미지 기준으로 완전 재측정(기존 kr 좌표 재사용 안 함,
 * 행 밴드는 노란 데크 vs 크림 키캡 B채널 다수결 스캔, 열 밴드는 각 행 안에서 좌우 프레임
 * 경계 실측 후 실제 칸 수로 균등분할 — 오버레이 렌더로 각 키 중심이 키캡 위에 오는지 육안
 * 재검증 완료). 새 이미지는 R2에 ㅔ 키가 실제로 존재(기존 이미지엔 없어 ㅔ/ㅖ 미지원이었음),
 * R4는 콤마가 2개(둘 다 ','로 매핑, 실제 사진 그대로). LCD 초록칸 위치·크기가 기존 대비 크게
 * 달라(top 6.944%→12.406%, height 30.303%→12.531%) css/style.css의 .machine-lcd도 갱신함.
 */
(function () {
  'use strict';

  const { HangulComposer } = window.Hangul;

  // --------------------------------------------------------------------
  // 글리프 정의 (기호 오버레이 전용, 원본 SVG 재사용)
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

  window.Glyphs = {};
  function buildGlyphSvgStrings() {
    for (const g of GLYPH_LIST) {
      const source = document.getElementById('glyph-' + g.id);
      if (!source) continue;
      const inner = source.innerHTML;
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><g style="color:#5B4A3F">${inner}</g></svg>`;
      window.Glyphs[g.id] = svgStr;
    }
  }

  // --------------------------------------------------------------------
  // 키보드 좌표 데이터 (트림 이미지 실측 %). rect = {left, top, width, height}
  // 각 키: { rect, key } — key는 논리 동작 식별자.
  // --------------------------------------------------------------------

  // R1(11칸: 숫자 1~0 + 삭제/취소) — 2026-07-05(12차) 새 kr_trim.png(1109x794) 균등분할 실측
  // (좌 58.5px ~ 우 1051.0px 프레임 안쪽을 11등분, 오버레이 육안 검증 완료).
  const R1_RECTS = [
    { left: 5.275, width: 8.136 },
    { left: 13.411, width: 8.136 },
    { left: 21.547, width: 8.136 },
    { left: 29.683, width: 8.136 },
    { left: 37.819, width: 8.136 },
    { left: 45.955, width: 8.136 },
    { left: 54.090, width: 8.136 },
    { left: 62.226, width: 8.136 },
    { left: 70.362, width: 8.136 },
    { left: 78.498, width: 8.136 },
    { left: 86.634, width: 8.136 }
  ];
  const R1_TOP = 40.554, R1_H = 9.950;
  const R1_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'del_cancel'];

  function buildRow(rects, top, height, keys) {
    return rects.map((r, i) => ({
      rect: { left: r.left, top, width: r.width, height },
      key: keys[i]
    }));
  }

  const R1 = buildRow(R1_RECTS, R1_TOP, R1_H, R1_KEYS);

  // ---- 한글 레이어 ----
  // 2026-07-05(12차) 새 kr_trim.png 실측: R2/R4는 좌 58.5px~우 1051.0px 프레임을 11등분,
  // R3는 10등분(오버레이 육안 검증 완료, docs/DEVLOG.md 12차 참고).
  // R2(11칸): ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ(10자모, 새 이미지엔 ㅔ가 실제로 있음) + 이모티콘
  const R2_KR_RECTS = [
    { left: 6.58, width: 7.03 }, { left: 15.24, width: 6.76 }, { left: 23.53, width: 6.76 },
    { left: 31.74, width: 6.76 }, { left: 39.95, width: 6.67 }, { left: 48.15, width: 6.67 },
    { left: 56.27, width: 6.31 }, { left: 63.93, width: 6.31 }, { left: 71.60, width: 6.22 },
    { left: 79.17, width: 6.31 }, { left: 86.65, width: 6.94 }
  ];
  const R2_KR_KEYS = ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ', 'emoji'];
  const R2_KR = buildRow(R2_KR_RECTS, 51.511, 8.438, R2_KR_KEYS);

  // R3(10칸): ㅁㄴㅇㄹㅎㅗㅓㅏㅣ(9자모) + BS
  const R3_KR_RECTS = [
    { left: 6.58, width: 7.12 }, { left: 15.24, width: 6.85 }, { left: 23.62, width: 6.67 },
    { left: 31.83, width: 6.67 }, { left: 39.95, width: 6.67 }, { left: 48.06, width: 6.67 },
    { left: 56.18, width: 6.40 }, { left: 63.93, width: 6.31 }, { left: 71.51, width: 6.31 },
    { left: 79.17, width: 6.22 }, { left: 86.56, width: 7.03 }
  ];
  const R3_KR_KEYS = ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅏ', 'ㅣ', 'backspace'];
  const R3_KR = buildRow(R3_KR_RECTS, 60.957, 8.438, R3_KR_KEYS);

  // R4(11칸): Shift ㅋㅌㅊㅍㅠㅜㅡ , , . (실측 결과 콤마가 실제로 2개, 사진 그대로 매핑)
  const R4_KR_RECTS = [
    { left: 6.76, width: 8.03 }, { left: 16.23, width: 6.49 }, { left: 24.17, width: 6.40 },
    { left: 32.01, width: 6.49 }, { left: 39.95, width: 6.67 }, { left: 48.06, width: 6.58 },
    { left: 56.09, width: 6.40 }, { left: 63.93, width: 6.22 }, { left: 71.51, width: 6.31 },
    { left: 79.08, width: 6.22 }, { left: 86.56, width: 7.03 }
  ];
  const R4_KR_KEYS = ['shift', 'ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ', ',', ',', '.'];
  const R4_KR = buildRow(R4_KR_RECTS, 70.277, 8.438, R4_KR_KEYS);

  // ---- 영문 레이어 ----
  // R2(11칸): QWERTYUIOP + 이모티콘(기존 Symbol 키를 이모지 레이어 토글로 재사용)
  const R2_EN_RECTS = [
    { left: 5.205, width: 8.311 }, { left: 13.790, width: 8.128 }, { left: 22.374, width: 8.128 },
    { left: 30.868, width: 8.128 }, { left: 39.361, width: 8.037 }, { left: 47.671, width: 7.854 },
    { left: 55.799, width: 7.671 }, { left: 63.744, width: 7.306 }, { left: 71.416, width: 6.941 },
    { left: 78.721, width: 7.032 }, { left: 86.027, width: 7.580 }
  ];
  const R2_EN_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'emoji'];
  const R2_EN = buildRow(R2_EN_RECTS, 50.886, 8.734, R2_EN_KEYS);

  // R3(10칸): ASDFGHJKL + BS
  const R3_EN_RECTS = [
    { left: 5.205, width: 8.767 }, { left: 14.338, width: 8.493 }, { left: 23.196, width: 8.128 },
    { left: 31.781, width: 8.219 }, { left: 40.365, width: 8.128 }, { left: 48.767, width: 7.854 },
    { left: 56.895, width: 7.945 }, { left: 65.205, width: 7.671 }, { left: 73.333, width: 7.580 },
    { left: 81.370, width: 12.237 }
  ];
  const R3_EN_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'backspace'];
  const R3_EN = buildRow(R3_EN_RECTS, 60.253, 8.481, R3_EN_KEYS);

  // R4(11칸): Shift Z X C V B N M – , .
  const R4_EN_RECTS = [
    { left: 5.205, width: 9.589 }, { left: 15.068, width: 7.945 }, { left: 23.470, width: 7.763 },
    { left: 31.689, width: 7.763 }, { left: 39.817, width: 7.671 }, { left: 47.945, width: 7.671 },
    { left: 55.982, width: 7.580 }, { left: 64.018, width: 7.489 }, { left: 71.872, width: 6.941 },
    { left: 79.178, width: 6.849 }, { left: 86.393, width: 7.215 }
  ];
  const R4_EN_KEYS = ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', ',', '.'];
  const R4_EN = buildRow(R4_EN_RECTS, 69.494, 8.481, R4_EN_KEYS);

  // R5(6그룹, 한글/영문/이모지 공용: 한영·Space·◀·▲▼·▶·선택줄변경).
  // 2026-07-05(12차) 새 kr_trim.png 실측 — ▲/▼는 원래 이미지에서도 세로로 분리된 별개
  // 버튼이라 겹치지 않지만(각자 그려진 위치가 이미 분리돼 있음), 히트존도 정확히 그 위에
  // 각자 배치해 재확인(위: top 79.219~83.879%, 아래: top 85.139~89.798%, 사이 gap 1.26%p).
  const R5_TOP = 79.849, R5_H = 9.950;
  const R5_RECTS = [
    { left: 5.320, width: 17.854, key: 'lang_toggle' },
    { left: 24.707, width: 26.781, key: 'space' },
    { left: 53.021, width: 8.656, key: 'left' },
    { left: 61.858, width: 6.853, upDown: true },
    { left: 70.243, width: 8.656, key: 'right' },
    { left: 79.080, width: 15.690, key: 'enter' }
  ];
  const UP_TOP = 79.219, UP_H = 4.660;
  const DOWN_TOP = 85.139, DOWN_H = 4.660;

  function buildR5() {
    const out = [];
    for (const r of R5_RECTS) {
      if (r.upDown) {
        // ▲/▼는 사진에서 이미 세로로 분리된 별개 버튼 — 히트존도 각자 실측 rect로 분리해
        // 절대 겹치지 않게 한다(기존 버그: 칸 절반으로 기계적 분할해 실제 버튼 위치와 안 맞았음).
        out.push({ rect: { left: r.left, top: UP_TOP, width: r.width, height: UP_H }, key: 'up' });
        out.push({ rect: { left: r.left, top: DOWN_TOP, width: r.width, height: DOWN_H }, key: 'down' });
      } else {
        out.push({ rect: { left: r.left, top: R5_TOP, width: r.width, height: R5_H }, key: r.key });
      }
    }
    return out;
  }
  const R5 = buildR5();

  // ---- 이모티콘 레이어 ----
  // assets/emoji_trim.png는 kr_trim.png와 세로 그리드(R1~R5의 top/height)는 동일 챠시이나,
  // R2/R3/R4의 "칸 개수·폭"은 한글 자판과 다르다(예: 한글 R2=9자모+토글=10칸인데 이모지
  // R2=10이모지+토글=11칸). 2026-07-05(10차) 세션은 이 칸 수 차이를 검증하지 않고 KR 좌표를
  // 그대로 재사용해 히트존이 실제 이모지 키 위에 얹히지 않는 버그가 있었다.
  // 이번 세션에서 emoji_trim.png 자체를 Python PIL로 독립 재측정했다(kr 좌표 미사용):
  // 크림 키캡 vs 노란 데크 색 전환을 열 방향으로 스캔해 각 행의 실제 칸 개수/폭/중심을 %로
  // 산출(측정 스크립트는 1회성 도구라 저장하지 않음, 수치는 docs/DEVLOG.md 참고).
  // 세로(top/height)는 emoji_trim에서도 다수결 재스캔으로 kr_trim과 사실상 동일함을 재확인
  // (R2/R3/R4 행 경계 오차 0.3% 이내) — 따라서 top/height만 kr_trim 값을 그대로 쓰고,
  // 가로 rect(개수·폭)는 아래처럼 emoji_trim 전용 값으로 교체했다.
  // 각 키에 그려진 그림은 스프라이트 17개와 정규화 비교(크롭 vs 스프라이트 나란히 시각 대조)로
  // 확정했다 — 순서 가정 없이 이미지에서 직접 도출.
  // R2(11칸, emoji_trim 실측): 곰·고양이·토끼·딸기·꽃·하트·반짝이(다이아단독=sparkle_pair)·
  //   반짝이(다이아+작은쌍=sparkle_small)·반짝이(별4점=sparkle_big)·리본·이모티콘(복귀).
  const R2_EMOJI_RECTS = [
    { left: 6.484, width: 7.123 }, { left: 15.068, width: 6.941 }, { left: 23.470, width: 6.849 },
    { left: 31.872, width: 6.758 }, { left: 40.183, width: 6.758 }, { left: 48.402, width: 6.667 },
    { left: 56.530, width: 6.393 }, { left: 64.384, width: 5.936 }, { left: 71.689, width: 6.210 },
    { left: 79.269, width: 6.027 }, { left: 86.667, width: 6.941 }
  ];
  const R2_EMOJI_KEYS = ['emoji:bear', 'emoji:cat', 'emoji:rabbit', 'emoji:strawberry', 'emoji:flower', 'emoji:heart', 'emoji:sparkle_pair', 'emoji:sparkle_small', 'emoji:sparkle_big', 'emoji:ribbon', 'emoji'];
  const R2_EMOJI = buildRow(R2_EMOJI_RECTS, R2_KR[0].rect.top, R2_KR[0].rect.height, R2_EMOJI_KEYS);

  // R3(10칸, emoji_trim 실측): 머그컵·구름·음표·달·스마일·별·반짝이(다이아+작은쌍=sparkle_small)·
  //   하트외곽선·빈칸(사진에 아이콘 없음)·BS.
  const R3_EMOJI_RECTS = [
    { left: 6.484, width: 7.489 }, { left: 15.616, width: 7.763 }, { left: 25.023, width: 7.580 },
    { left: 34.338, width: 7.945 }, { left: 43.927, width: 7.945 }, { left: 53.607, width: 7.397 },
    { left: 62.648, width: 6.758 }, { left: 71.050, width: 6.667 }, { left: 77.900, width: 8.402 },
    { left: 86.393, width: 7.215 }
  ];
  const R3_EMOJI_KEYS = ['emoji:mug', 'emoji:cloud', 'emoji:note', 'emoji:moon', 'emoji:smiley', 'emoji:star', 'emoji:sparkle_small', 'emoji:heart_outline', null, 'backspace'];
  const R3_EMOJI = buildRow(R3_EMOJI_RECTS, R3_KR[0].rect.top, R3_KR[0].rect.height, R3_EMOJI_KEYS);
  // 9번째 칸(null)은 사진에도 아이콘이 없는 빈 키캡 — 비활성 처리(isKeyDisabled에서 처리).

  // R4(11칸, emoji_trim 실측): Shift·반짝이(별4점=sparkle_big)·리본·꽃·곰·고양이·토끼·딸기·구름·,·.
  // 8종 전부 R2/R3와 중복되는 이모지라, 삽입 시 "미니" 사이즈로 구분한다(사용자 요청).
  // 키 식별자에 ':mini' 접미사를 붙여 handleKeyPress가 size:'mini' 토큰을 삽입하도록 표시.
  const R4_EMOJI_RECTS = [
    { left: 5.114, width: 11.050 }, { left: 16.256, width: 6.301 }, { left: 23.836, width: 6.301 },
    { left: 31.507, width: 6.119 }, { left: 39.087, width: 6.119 }, { left: 46.575, width: 6.210 },
    { left: 54.155, width: 6.210 }, { left: 61.735, width: 6.210 }, { left: 69.315, width: 6.301 },
    { left: 77.169, width: 7.489 }, { left: 86.119, width: 7.489 }
  ];
  const R4_EMOJI_KEYS = ['shift', 'emoji:sparkle_big:mini', 'emoji:ribbon:mini', 'emoji:flower:mini', 'emoji:bear:mini', 'emoji:cat:mini', 'emoji:rabbit:mini', 'emoji:strawberry:mini', 'emoji:cloud:mini', ',', '.'];
  const R4_EMOJI = buildRow(R4_EMOJI_RECTS, R4_KR[0].rect.top, R4_KR[0].rect.height, R4_EMOJI_KEYS);
  // Shift는 이 레이어에 의미가 없어 비활성(isKeyDisabled) 처리. 사진 실측 결과 R4는 이모지
  // 8칸 뒤에 콤마·마침표 키가 별도로 존재한다(기존 코드가 콤마 칸을 구름으로 잘못 흡수했던
  // 것과 달리, 실제로는 구름 이모지와 콤마가 각각 별개의 칸).

  // 이모지 스프라이트 id -> 파일 경로. assets/emoji-sheet.png(흰 배경, 검정 픽셀 이모지)를
  // PIL 연결요소 검출로 슬라이스한 17개 투명 PNG(잉크색 #3A3330 틴트 적용 완료).
  const EMOJI_SPRITES = {
    bear: 'assets/emoji/bear.png',
    cat: 'assets/emoji/cat.png',
    rabbit: 'assets/emoji/rabbit.png',
    strawberry: 'assets/emoji/strawberry.png',
    flower: 'assets/emoji/flower.png',
    heart: 'assets/emoji/heart.png',
    heart_outline: 'assets/emoji/heart_outline.png',
    sparkle_big: 'assets/emoji/sparkle_big.png',
    sparkle_pair: 'assets/emoji/sparkle_pair.png',
    sparkle_small: 'assets/emoji/sparkle_small.png',
    ribbon: 'assets/emoji/ribbon.png',
    mug: 'assets/emoji/mug.png',
    cloud: 'assets/emoji/cloud.png',
    note: 'assets/emoji/note.png',
    moon: 'assets/emoji/moon.png',
    smiley: 'assets/emoji/smiley.png',
    star: 'assets/emoji/star.png'
  };
  window.EmojiSprites = EMOJI_SPRITES;

  function keyboardLayout(kbLayer) {
    if (kbLayer === 'english') {
      return [...R1, ...R2_EN, ...R3_EN, ...R4_EN, ...R5];
    }
    if (kbLayer === 'emoji') {
      return [...R1, ...R2_EMOJI, ...R3_EMOJI, ...R4_EMOJI, ...R5];
    }
    return [...R1, ...R2_KR, ...R3_KR, ...R4_KR, ...R5];
  }

  // --------------------------------------------------------------------
  // 상태
  // --------------------------------------------------------------------
  // 라벨 출력 폰트는 항상 Galmuri11(도트 픽셀폰트, LCD와 동일) 고정 — 폰트 선택 UI 폐기.
  // 사진 텍스처 폐기와 함께 Jua/Gaegu도 더 이상 쓰지 않는다(render.js가 항상 Galmuri11로 그림).
  const TAPE_OPTIONS = [
    { id: '#FFFFFF', label: '화이트' },
    { id: '#FFF3DA', label: '크림' },
    { id: '#FBE3E8', label: '핑크' },
    { id: '#DCEBF5', label: '하늘' },
    { id: '#DFF0DC', label: '민트' },
    { id: '#E6E0F2', label: '라벤더' }
  ];
  const FRAME_OPTIONS = [
    { id: 'none', label: '없음' },
    { id: 'solid', label: '실선' },
    { id: 'dashed', label: '점선' },
    { id: 'speech', label: '말풍선' },
    { id: 'scallop', label: '스캘럽' },
    { id: 'invert', label: '반전' }
  ];
  const SIZE_OPTIONS = [
    { id: 'strip', label: '스트립' },
    { id: 'square', label: '정사각' }
  ];
  const SETTING_CATEGORIES = [
    { key: 'tape', label: '테이프색', options: TAPE_OPTIONS },
    { key: 'frame', label: '프레임', options: FRAME_OPTIONS },
    { key: 'size', label: '사이즈', options: SIZE_OPTIONS }
  ];

  const state = {
    tokens: [],
    composer: new HangulComposer(),
    kbLayer: 'hangul',       // 'hangul' | 'english' | 'emoji' — 실제 배경이미지/좌표맵 전환
    prevTextLayer: 'hangul', // 이모지 레이어 진입 전 텍스트 레이어('hangul'|'english') 기억 — 복귀용
    shift: false,            // 한글: 쌍자음, 영문: 대소문자
    // LCD 표시 모드: 'text' | 'settings' | 'confirm'
    mode: 'text',
    settingIndex: 0,
    tapeIdx: 0,
    frameIdx: 0,
    sizeIdx: 0,
    confirmYes: true,        // 출력확인 모드에서 예/아니오 선택 상태
    confirmSource: null,     // 출력확인을 트리거한 소스 ('pink' | 'oval-print')
    isPrinting: false,
    // LCD 가로 스크롤 caret — 텍스트 모드 전용. 전체 글자 수(토큰 펼친 길이) 중 몇 번째
    // "글자 뒤"에 캐럿이 있는지를 가리키는 인덱스(0 = 맨 앞, length = 맨 끝).
    // 입력은 항상 버퍼 끝에 append되므로(삽입 포인터 아님), 입력 시 caret도 항상 끝으로 따라간다.
    // ◀/▶는 caret만 이동시켜 "숨었던 글자를 다시 보이게" 스크롤 재계산을 트리거한다.
    caret: 0
  };

  // 전체 표시 길이(토큰을 펼쳤을 때 글자 수, 글리프는 1글자로 취급) — caret 범위 계산용.
  function totalDisplayLength() {
    let n = 0;
    for (const tok of state.tokens) {
      n += tok.type === 'text' ? tok.value.length : 1;
    }
    return n;
  }

  function currentTape() { return TAPE_OPTIONS[state.tapeIdx].id; }
  function currentFrame() { return FRAME_OPTIONS[state.frameIdx].id; }
  function currentSize() { return SIZE_OPTIONS[state.sizeIdx].id; }

  function getOrCreateLastTextToken() {
    const last = state.tokens[state.tokens.length - 1];
    if (last && last.type === 'text') return last;
    const tok = { type: 'text', value: '' };
    state.tokens.push(tok);
    return tok;
  }

  function commitChar(ch) {
    if (!ch) return;
    const tok = getOrCreateLastTextToken();
    tok.value += ch;
    state.caret = totalDisplayLength();
  }

  function removeLastChar() {
    const last = state.tokens[state.tokens.length - 1];
    if (!last) return;
    if (last.type === 'glyph' || last.type === 'emoji') {
      state.tokens.pop();
    } else if (last.type === 'text') {
      if (last.value.length > 0) {
        last.value = last.value.slice(0, -1);
      }
      if (last.value.length === 0) {
        state.tokens.pop();
      }
    }
    state.caret = totalDisplayLength();
  }

  // 이모지 키(emoji:xxx[:mini]) 입력 — 기존 글리프 토큰 방식과 동일한 패턴으로 텍스트 버퍼에
  // { type:'emoji', id, size } 토큰을 삽입한다. id는 EMOJI_SPRITES의 키(스프라이트 파일명),
  // size는 'normal'(기본, R2/R3) | 'mini'(R4 중복 키, 약 60~70% 축소 렌더).
  function insertEmoji(id, size) {
    flushComposer();
    state.tokens.push({ type: 'emoji', id, size: size || 'normal' });
    state.caret = totalDisplayLength();
    renderLcd();
  }

  function flushComposer() {
    const committed = state.composer.commit();
    if (committed) commitChar(committed);
  }

  // --------------------------------------------------------------------
  // 한글 자모 입력 (HangulComposer 재사용) / 영문 입력
  // --------------------------------------------------------------------
  function handleJamoInput(jamo) {
    const { committed, current } = state.composer.push(jamo);
    if (committed) commitChar(committed);
    renderLcd(current);
  }

  function handleEnglishInput(ch) {
    flushComposer();
    const out = state.shift ? ch.toUpperCase() : ch.toLowerCase();
    commitChar(out);
    renderLcd();
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

  function handleClearAll() {
    flushComposer();
    state.tokens = [];
    state.composer.reset();
    state.caret = 0;
    renderLcd();
  }

  function handleSpace() {
    flushComposer();
    commitChar(' ');
    renderLcd();
  }

  function handleNewlineOrConfirm() {
    if (state.mode === 'confirm') {
      confirmPrintDecision();
      return;
    }
    if (state.mode === 'settings') {
      state.mode = 'text';
      renderLcd();
      return;
    }
    flushComposer();
    commitChar('\n');
    renderLcd();
  }

  // --------------------------------------------------------------------
  // Shift: 한글 = 다음 입력 쌍자음/ㅒㅖ 전환, 영문 = 대소문자 토글
  // --------------------------------------------------------------------
  const DOUBLE_CONSONANT = { 'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ' };
  // 2026-07-05(12차): 새 kr_trim.png에는 ㅔ 키가 실제로 존재해 ㅖ 전환도 지원 추가
  // (hangul.js의 JUNG 배열에 'ㅖ'가 이미 있어 조합 자체는 기존부터 지원됨, 키 매핑만 추가).
  const SHIFT_VOWEL = { 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ' };

  function shiftJamo(jamo) {
    if (!state.shift) return jamo;
    if (DOUBLE_CONSONANT[jamo]) return DOUBLE_CONSONANT[jamo];
    if (SHIFT_VOWEL[jamo]) return SHIFT_VOWEL[jamo];
    return jamo;
  }

  // --------------------------------------------------------------------
  // LCD 렌더링 (DotGothic16 픽셀폰트)
  // --------------------------------------------------------------------
  const lcdTextEl = document.getElementById('lcdText');
  const lcdCursorEl = document.getElementById('lcdCursor');
  const lcdScreenEl = document.getElementById('lcdScreen');
  const lcdTrackEl = document.getElementById('lcdTrack');

  // 텍스트 모드 전용: 버퍼(state.tokens, + 조합 중인 글자)를 caret 위치에서
  // "앞부분 / 커서 / 뒷부분" 세 조각으로 나눠 track에 그린다. 렌더 후 caret의
  // offsetLeft를 측정해 뷰포트(.lcd-screen) 안에 항상 보이도록 track을 translateX한다.
  function renderLcd(composingChar) {
    lcdTrackEl.style.flexDirection = 'row';
    if (state.mode === 'settings') { lcdScreenEl.classList.add('is-modal'); renderLcdSettings(); return; }
    if (state.mode === 'confirm') { lcdScreenEl.classList.add('is-modal'); renderLcdConfirm(); return; }
    lcdScreenEl.classList.remove('is-modal');

    lcdTextEl.innerHTML = '';
    lcdTextEl.style.flexDirection = ''; // confirm 모드(column)에서 남았을 수 있어 원복
    lcdCursorEl.hidden = false;

    const hasContent = state.tokens.length > 0 || (composingChar && composingChar.length > 0);
    if (!hasContent) {
      const ph = document.createElement('span');
      ph.style.opacity = '0.5';
      ph.textContent = '문구를 입력하세요';
      lcdTextEl.appendChild(ph);
      lcdTrackEl.style.transform = 'translateX(0)';
      return;
    }

    // caret 앞/뒤로 나눠서 커서(span#lcdCursor)를 그 사이에 배치한다.
    // 조합 중인 글자(composingChar)는 항상 맨 끝(caret 뒤)에 붙는 임시 표시라 caret 분할 대상에서 제외.
    const caret = Math.max(0, Math.min(state.caret, totalDisplayLength()));
    let remaining = caret;
    const beforeFrag = document.createDocumentFragment();
    const afterFrag = document.createDocumentFragment();

    for (const tok of state.tokens) {
      if (tok.type === 'text') {
        if (tok.value.length === 0) continue;
        if (remaining >= tok.value.length) {
          const span = document.createElement('span');
          span.textContent = tok.value;
          beforeFrag.appendChild(span);
          remaining -= tok.value.length;
        } else if (remaining <= 0) {
          const span = document.createElement('span');
          span.textContent = tok.value;
          afterFrag.appendChild(span);
        } else {
          const spanA = document.createElement('span');
          spanA.textContent = tok.value.slice(0, remaining);
          beforeFrag.appendChild(spanA);
          const spanB = document.createElement('span');
          spanB.textContent = tok.value.slice(remaining);
          afterFrag.appendChild(spanB);
          remaining = 0;
        }
      } else if (tok.type === 'glyph') {
        const target = remaining > 0 ? beforeFrag : afterFrag;
        target.appendChild(makeGlyphIcon(tok.id));
        if (remaining > 0) remaining -= 1;
      } else if (tok.type === 'emoji') {
        const target = remaining > 0 ? beforeFrag : afterFrag;
        target.appendChild(makeEmojiIcon(tok.id, tok.size));
        if (remaining > 0) remaining -= 1;
      }
    }

    // 커서(#lcdCursor)는 마크업상 lcdTextEl의 형제(lcdTrack의 자식)라 실제 위치를 옮기려면
    // lcdTextEl 안에서 beforeFrag 뒤 / afterFrag 앞에 직접 끼워 넣어야 한다.
    lcdTextEl.appendChild(beforeFrag);
    if (composingChar) {
      const span = document.createElement('span');
      span.textContent = composingChar;
      lcdTextEl.appendChild(span);
    }
    lcdTextEl.appendChild(lcdCursorEl);
    lcdCursorEl.hidden = false;
    lcdTextEl.appendChild(afterFrag);

    scrollLcdToCaret();
  }

  // caret(=lcdCursorEl) 위치가 뷰포트 안에 보이도록 track을 translateX로 이동.
  // caret이 뷰포트 오른쪽 밖이면 왼쪽으로 밀어 오른쪽 여유 패딩만큼만 보이게,
  // caret이 뷰포트 왼쪽보다 앞이면 그만큼 되돌려 보이게 한다(음수 translateX = 왼쪽 클립).
  function scrollLcdToCaret() {
    // track은 .lcd-screen의 content box(패딩 제외) 안, flex로 배치된다.
    // offsetLeft는 offsetParent(=lcdTrackEl 자신이 relative라 그 내부 좌표계, 즉
    // "translateX 적용 전 track 원점 기준 좌표")라 패딩과 무관하게 순수 텍스트 진행 좌표다.
    // 따라서 비교 기준도 패딩을 뺀 content 폭(usableW)으로 맞춘다.
    const cs = getComputedStyle(lcdScreenEl);
    const usableW = lcdScreenEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const caretRight = lcdCursorEl.offsetLeft + lcdCursorEl.offsetWidth;
    const caretLeft = lcdCursorEl.offsetLeft;
    const curX = getTrackOffset();
    const pad = 4; // 커서가 뷰포트 경계에 딱 붙지 않도록 여유

    let next = curX;
    // caret 오른쪽 끝이 뷰포트 밖으로 나가면 왼쪽으로 밀어 보이게
    if (caretRight + next > usableW - pad) {
      next = usableW - pad - caretRight;
    }
    // caret 왼쪽 끝이 뷰포트 왼쪽 밖(음수 영역)이면 되돌려 보이게
    if (caretLeft + next < pad) {
      next = pad - caretLeft;
    }
    // track이 뷰포트보다 좁으면(짧은 텍스트) 항상 원점에 고정
    if (lcdTrackEl.scrollWidth <= usableW) {
      next = 0;
    }
    next = Math.min(0, next); // 오른쪽으로는 밀지 않음(항상 왼쪽 정렬이 기본)
    lcdTrackEl.style.transform = `translateX(${next}px)`;
  }

  function getTrackOffset() {
    const m = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(lcdTrackEl.style.transform || '');
    return m ? parseFloat(m[1]) : 0;
  }

  function renderLcdSettings() {
    lcdTrackEl.appendChild(lcdCursorEl); // 텍스트 모드에서 lcdTextEl 안으로 옮겨졌을 수 있어 원위치
    lcdTextEl.innerHTML = '';
    lcdTextEl.style.flexDirection = '';
    lcdCursorEl.hidden = true;
    lcdTrackEl.style.transform = 'translateX(0)';
    const cat = SETTING_CATEGORIES[state.settingIndex];
    const idxKeyMap = { tape: 'tapeIdx', frame: 'frameIdx', size: 'sizeIdx' };
    const curIdx = state[idxKeyMap[cat.key]];
    const opt = cat.options[curIdx];

    const line = document.createElement('div');
    line.className = 'lcd-settings-line';

    const labelSpan = document.createElement('span');
    labelSpan.style.fontWeight = '700';
    labelSpan.textContent = cat.label + ': ';
    line.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.textContent = opt.label;
    line.appendChild(valueSpan);

    if (cat.key === 'tape') {
      const swatch = document.createElement('span');
      swatch.style.display = 'inline-block';
      swatch.style.width = '10px';
      swatch.style.height = '10px';
      swatch.style.borderRadius = '50%';
      swatch.style.marginLeft = '4px';
      swatch.style.background = opt.id;
      swatch.style.border = '1px solid rgba(0,0,0,0.15)';
      line.appendChild(swatch);
    }

    const arrows = document.createElement('span');
    arrows.textContent = ' ◀▶';
    line.appendChild(arrows);

    lcdTextEl.appendChild(line);
  }

  // 예/아니오 확인창 — 초록칸(LCD) 안에 완전히 클립되도록 2줄 flex-column,
  // 폰트는 .lcd-screen.is-modal에서 축소(3.6cqw). 선택된 쪽은 반전(진배경+연한 글자) 하이라이트.
  function renderLcdConfirm() {
    lcdTrackEl.appendChild(lcdCursorEl); // 텍스트 모드에서 lcdTextEl 안으로 옮겨졌을 수 있어 원위치
    lcdTextEl.innerHTML = '';
    lcdCursorEl.hidden = true;
    lcdTrackEl.style.transform = 'translateX(0)';

    const line1 = document.createElement('div');
    line1.className = 'lcd-confirm-line1';
    line1.textContent = '출력하시겠습니까?';

    const line2 = document.createElement('div');
    line2.className = 'lcd-confirm-line2';

    const yes = document.createElement('span');
    yes.className = 'lcd-confirm-opt' + (state.confirmYes ? ' is-selected' : '');
    yes.textContent = '예';

    const no = document.createElement('span');
    no.className = 'lcd-confirm-opt' + (!state.confirmYes ? ' is-selected' : '');
    no.textContent = '아니오';

    line2.appendChild(yes);
    line2.appendChild(no);

    lcdTextEl.style.flexDirection = 'column';
    lcdTextEl.appendChild(line1);
    lcdTextEl.appendChild(line2);
  }

  function makeGlyphIcon(id) {
    const wrap = document.createElement('span');
    wrap.className = 'lcd-glyph';
    const svgStr = window.Glyphs[id];
    if (svgStr) wrap.innerHTML = svgStr;
    return wrap;
  }

  // 이모지 스프라이트를 LCD 텍스트 흐름 안에 인라인으로 표시(줄 높이에 맞춘 작은 이미지).
  // size:'mini'(R4 중복 키로 삽입된 이모지)면 .lcd-emoji--mini 클래스로 축소 렌더(약 60~70%).
  function makeEmojiIcon(id, size) {
    const wrap = document.createElement('span');
    wrap.className = 'lcd-emoji' + (size === 'mini' ? ' lcd-emoji--mini' : '');
    const src = EMOJI_SPRITES[id];
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      wrap.appendChild(img);
    }
    return wrap;
  }

  // --------------------------------------------------------------------
  // 온스크린 키보드 히트존 렌더 (사진 위 투명 버튼만, 좌표는 % 인라인 스타일)
  // --------------------------------------------------------------------
  const keyboardEl = document.getElementById('keyboard');
  const machineEl = document.getElementById('machine');
  const machineImgEl = document.getElementById('machineImg');
  const MACHINE_IMG_SRC = { hangul: 'assets/kr_trim.png', english: 'assets/en_trim.png', emoji: 'assets/emoji_trim.png' };

  function applyRect(el, rect) {
    el.style.left = rect.left + '%';
    el.style.top = rect.top + '%';
    el.style.width = rect.width + '%';
    el.style.height = rect.height + '%';
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = '';
    const layout = keyboardLayout(state.kbLayer);

    for (const item of layout) {
      // R3_EMOJI의 9번째 칸처럼 사진에 아이콘 자체가 없는 완전 빈 키캡은 key:null로 표시되고
      // 렌더 대상에서 제외한다(히트존 자체를 만들지 않음 — 클릭해도 아무 반응 없는 죽은
      // 버튼보다, 애초에 존재하지 않는 편이 정직하다).
      if (item.key === null) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keyzone';
      applyRect(btn, item.rect);
      btn.setAttribute('aria-label', keyAriaLabel(item.key));

      const disabled = isKeyDisabled(item.key);
      if (disabled) {
        btn.classList.add('is-disabled');
        btn.disabled = true;
      }

      addPressFeedback(btn);
      btn.addEventListener('click', () => {
        handleKeyPress(item.key);
        focusHiddenInputSilently();
      });
      keyboardEl.appendChild(btn);
    }
  }

  function isKeyDisabled(key) {
    // 이모지 레이어에서는 Shift가 의미 없다(대소문자/쌍자음 전환 대상이 없음) — 비활성 처리.
    if (state.kbLayer === 'emoji' && key === 'shift') return true;
    return false;
  }

  function keyAriaLabel(key) {
    if (typeof key === 'string' && key.indexOf('emoji:') === 0) {
      return '이모지 삽입';
    }
    switch (key) {
      case 'del_cancel': return '삭제 취소';
      case 'emoji': return state.kbLayer === 'emoji' ? '가나다 복귀' : '이모티콘';
      case 'backspace': return '백스페이스';
      case 'shift': return 'Shift';
      case 'lang_toggle': return '한/영 전환';
      case 'space': return 'Space';
      case 'left': return '왼쪽 이동';
      case 'right': return '오른쪽 이동';
      case 'up': return '위';
      case 'down': return '아래';
      case 'enter': return '선택 줄변경';
      default: return key;
    }
  }

  function handleKeyPress(key) {
    // 숫자 키 (한글/영문 공통)
    if (/^[0-9]$/.test(key)) {
      flushComposer();
      commitChar(key);
      renderLcd();
      playKeySound(key);
      return;
    }
    if (key === 'del_cancel') {
      handleClearAll();
      playKeySound(key);
      return;
    }
    if (key === 'backspace') {
      handleBackspace();
      playKeySound(key);
      return;
    }
    if (key === 'space') {
      handleSpace();
      playKeySound(key);
      return;
    }
    if (key === 'shift') {
      state.shift = !state.shift;
      playKeySound(key);
      return;
    }
    if (key === 'lang_toggle') {
      toggleLang();
      playKeySound(key);
      return;
    }
    if (key === 'emoji') {
      toggleEmojiLayer();
      playKeySound(key);
      return;
    }
    if (typeof key === 'string' && key.indexOf('emoji:') === 0) {
      // 'emoji:id' 또는 'emoji:id:mini' 형식 — 뒤의 ':mini'가 있으면 축소 렌더 플래그.
      const rest = key.slice('emoji:'.length);
      const miniSuffix = ':mini';
      const isMini = rest.endsWith(miniSuffix);
      const emojiId = isMini ? rest.slice(0, -miniSuffix.length) : rest;
      insertEmoji(emojiId, isMini ? 'mini' : 'normal');
      window.LabelSound && window.LabelSound.playKey();
      return;
    }
    if (key === 'left') {
      handleArrow('left');
      playKeySound(key);
      return;
    }
    if (key === 'right') {
      handleArrow('right');
      playKeySound(key);
      return;
    }
    if (key === 'up') {
      handleArrow('up');
      playKeySound(key);
      return;
    }
    if (key === 'down') {
      handleArrow('down');
      playKeySound(key);
      return;
    }
    if (key === 'enter') {
      handleNewlineOrConfirm();
      playKeySound(key);
      return;
    }
    if (key === ',' || key === '.' || key === '-') {
      flushComposer();
      commitChar(key);
      renderLcd();
      playKeySound(key);
      return;
    }
    // 한글 자모 (state.kbLayer === 'hangul')
    if (state.kbLayer === 'hangul') {
      handleJamoInput(shiftJamo(key));
      playKeySound(key);
      return;
    }
    // 영문 알파벳
    if (state.kbLayer === 'english') {
      handleEnglishInput(key);
      playKeySound(key);
      return;
    }
  }

  function handleArrow(dir) {
    if (state.mode === 'settings') {
      if (dir === 'up') {
        state.settingIndex = (state.settingIndex - 1 + SETTING_CATEGORIES.length) % SETTING_CATEGORIES.length;
      } else if (dir === 'down') {
        state.settingIndex = (state.settingIndex + 1) % SETTING_CATEGORIES.length;
      } else if (dir === 'left' || dir === 'right') {
        cycleSettingValue(dir === 'right' ? 1 : -1);
      }
      renderLcd();
      return;
    }
    if (state.mode === 'confirm') {
      // ◀▶(및 ▲▼)로 예/아니오 커서 이동 — 옵션이 2개뿐이라 방향 상관없이 토글.
      state.confirmYes = !state.confirmYes;
      renderLcd();
      return;
    }
    // text 모드: ◀/▶는 LCD caret을 한 칸씩 이동 + 재스크롤(숨었던 왼쪽 글자가 다시 보임).
    // ▲/▼는 이 모드에 해당 기능이 없어 기존과 동일하게 무시(YAGNI).
    if (state.mode === 'text') {
      if (dir === 'left') {
        state.caret = Math.max(0, state.caret - 1);
        renderLcd();
      } else if (dir === 'right') {
        state.caret = Math.min(totalDisplayLength(), state.caret + 1);
        renderLcd();
      }
    }
  }

  function cycleSettingValue(dir) {
    const cat = SETTING_CATEGORIES[state.settingIndex];
    if (cat.key === 'tape') {
      state.tapeIdx = (state.tapeIdx + dir + TAPE_OPTIONS.length) % TAPE_OPTIONS.length;
    } else if (cat.key === 'frame') {
      state.frameIdx = (state.frameIdx + dir + FRAME_OPTIONS.length) % FRAME_OPTIONS.length;
    } else if (cat.key === 'size') {
      state.sizeIdx = (state.sizeIdx + dir + SIZE_OPTIONS.length) % SIZE_OPTIONS.length;
    }
  }

  function toggleLang() {
    flushComposer();
    renderLcd();
    // 이모지 레이어 중에 한/영 키를 누르면(R5는 공용 좌표라 이모지 레이어에도 존재)
    // 텍스트 레이어를 전환하면서 동시에 이모지 레이어를 빠져나간다 — 그 반대(이모지 레이어
    // 진입 중 유지)는 의미가 없으므로 자연스럽게 텍스트 모드로 복귀.
    const base = state.kbLayer === 'emoji' ? state.prevTextLayer : state.kbLayer;
    state.kbLayer = base === 'hangul' ? 'english' : 'hangul';
    state.prevTextLayer = state.kbLayer;
    state.shift = false;
    machineImgEl.src = MACHINE_IMG_SRC[state.kbLayer];
    renderKeyboard();
  }

  // 이모티콘 키: 한/영 전환과 동일한 방식(이미지 src 교체 + 좌표맵 교체)으로 3번째
  // 키보드 이미지 레이어(assets/emoji_trim.png)를 켜고 끈다. 다시 누르면(이 키는 이모지
  // 레이어 안에서 "가나다" 복귀 라벨 역할) 직전 텍스트 레이어(한글/영문)로 되돌아간다.
  function toggleEmojiLayer() {
    flushComposer();
    if (state.kbLayer === 'emoji') {
      state.kbLayer = state.prevTextLayer;
    } else {
      state.prevTextLayer = state.kbLayer; // hangul 또는 english 기억
      state.kbLayer = 'emoji';
      state.shift = false;
    }
    machineImgEl.src = MACHINE_IMG_SRC[state.kbLayer];
    renderKeyboard();
    renderLcd();
  }

  function addPressFeedback(btn) {
    let pressTimer = null;
    function press() {
      btn.classList.add('is-pressed');
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(() => btn.classList.remove('is-pressed'), 90);
    }
    btn.addEventListener('pointerdown', press);
  }

  // --------------------------------------------------------------------
  // 오벌 5개 히트존: 인쇄 / 미리보기 / 파일 / 새라벨 / 환경
  // --------------------------------------------------------------------
  const ovalsRowEl = document.getElementById('ovalsRow');
  const OVAL_DEFS = [
    { key: 'print', label: '인쇄' },
    { key: 'preview', label: '미리보기' },
    { key: 'file', label: '파일' },
    { key: 'newlabel', label: '새라벨' },
    { key: 'settings', label: '환경' }
  ];

  function renderOvals() {
    ovalsRowEl.innerHTML = '';
    for (const def of OVAL_DEFS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'oval-hitzone';
      btn.dataset.oval = def.key;
      btn.setAttribute('aria-label', def.label);
      addPressFeedback(btn);
      btn.addEventListener('click', () => {
        handleOvalPress(def.key);
        focusHiddenInputSilently();
      });
      ovalsRowEl.appendChild(btn);
    }
  }

  function handleOvalPress(key) {
    if (key === 'print') {
      playClickSound();
      openPrintConfirm('oval-print');
      return;
    }
    if (key === 'newlabel') {
      handleClearAll();
      window.LabelSound && window.LabelSound.playKeyLow();
      return;
    }
    if (key === 'settings') {
      state.mode = state.mode === 'settings' ? 'text' : 'settings';
      renderLcd();
      window.LabelSound && window.LabelSound.playKeyLow();
      return;
    }
    // 미리보기/파일: 가벼운 no-op, LCD 힌트만 잠깐 보여주고 복귀
    if (key === 'preview' || key === 'file') {
      showLcdHint(key === 'preview' ? '미리보기 준비중' : '파일 기능 준비중');
      window.LabelSound && window.LabelSound.playKeyLow();
    }
  }

  let hintTimer = null;
  function showLcdHint(text) {
    if (state.mode !== 'text') return;
    if (hintTimer) clearTimeout(hintTimer);
    lcdTextEl.innerHTML = '';
    lcdCursorEl.hidden = true;
    const span = document.createElement('span');
    span.style.opacity = '0.7';
    span.textContent = text;
    lcdTextEl.appendChild(span);
    hintTimer = setTimeout(() => { renderLcd(); }, 900);
  }

  // --------------------------------------------------------------------
  // 실제 키보드(IME) 입력 — 레이어 상태와 무관하게 항상 한글 조합 그대로 받는다
  // --------------------------------------------------------------------
  const hiddenInput = document.getElementById('hiddenInput');
  let isComposing = false;

  function focusHiddenInputSilently() {
    hiddenInput.focus({ preventScroll: true });
  }

  hiddenInput.addEventListener('compositionstart', () => {
    isComposing = true;
  });

  hiddenInput.addEventListener('compositionupdate', (e) => {
    renderLcd(e.data || '');
  });

  hiddenInput.addEventListener('compositionend', (e) => {
    isComposing = false;
    const finalChar = e.data || '';
    if (finalChar) commitChar(finalChar);
    hiddenInput.value = '';
    renderLcd();
  });

  hiddenInput.addEventListener('input', () => {
    if (isComposing) return;
    const val = hiddenInput.value;
    if (val === '') return;
    for (const ch of val) {
      if (ch === '\b') continue;
      commitChar(ch);
    }
    hiddenInput.value = '';
    renderLcd();
  });

  hiddenInput.addEventListener('keydown', (e) => {
    if (isComposing) return;
    if (state.mode !== 'text') return; // 설정/확인 모드에선 실키보드 텍스트 입력 무시
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === ' ') {
      e.preventDefault();
      handleSpace();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleNewlineOrConfirm();
    }
  });

  document.addEventListener('pointerdown', (e) => {
    const target = e.target;
    if (target.closest('.keyzone') || target.closest('button') || target === hiddenInput) return;
    focusHiddenInputSilently();
  });

  // --------------------------------------------------------------------
  // 사운드 도우미 — 기능키는 낮은 톤, 일반 키는 기본 톤
  // --------------------------------------------------------------------
  const LOW_TONE_KEYS = new Set(['space', 'backspace', 'del_cancel', 'lang_toggle', 'emoji', 'shift', 'left', 'right', 'up', 'down', 'enter']);
  function playKeySound(key) {
    if (!window.LabelSound) return;
    if (LOW_TONE_KEYS.has(key)) {
      window.LabelSound.playKeyLow();
    } else {
      window.LabelSound.playKey();
    }
  }
  function playClickSound() {
    window.LabelSound && window.LabelSound.playClick();
  }

  // --------------------------------------------------------------------
  // 출력 확인 플로우 (핑크 버튼 / 인쇄 오벌 공통)
  // --------------------------------------------------------------------
  const printBtn = document.getElementById('printBtn');
  const labelCanvas = document.getElementById('labelCanvas');
  const labelDownloadBtn = document.getElementById('labelDownloadBtn');
  const toastEl = document.getElementById('toast');

  function hasAnyContent() {
    return state.tokens.some(t => (t.type === 'text' && t.value.trim().length > 0) || t.type === 'glyph');
  }

  function openPrintConfirm(source) {
    if (state.isPrinting) return;
    flushComposer();
    if (!hasAnyContent()) {
      showLcdHint('입력된 문구 없음');
      return;
    }
    state.confirmSource = source;
    state.confirmYes = true;
    state.mode = 'confirm';
    renderLcd();
  }

  function confirmPrintDecision() {
    const yes = state.confirmYes;
    state.mode = 'text';
    if (yes) {
      renderLcd();
      startPrint();
    } else {
      renderLcd();
    }
  }

  // 핑크버튼은 "창 열기"만 담당한다. 확인 모드 중 재클릭으로 확정하던 기존 동작은 제거 —
  // 확정은 오직 선택·줄변경(enter) 버튼으로만 한다(요청사항).
  printBtn.addEventListener('click', () => {
    if (state.mode === 'confirm') {
      focusHiddenInputSilently();
      return;
    }
    playClickSound();
    openPrintConfirm('pink');
    focusHiddenInputSilently();
  });

  // 라벨 출력 폰트는 항상 Galmuri11 고정(render.js), 여기서는 폰트를 넘기지 않는다.
  function buildRenderOpts(scale) {
    return {
      tokens: cloneTokens(state.tokens),
      tapeColor: currentTape(),
      frame: currentFrame(),
      size: currentSize(),
      scale
    };
  }

  // 스텝형 급지 리듬의 keyframe 퍼센트 지점(print-winch의 "훅 올라옴" 시작점들, css/style.css
  // @keyframes print-winch와 동일한 8/16/24/.../88/100 12스텝). 사운드를 이 퍼센트 지점마다
  // 재생해 "두두두" 시각 연출과 청각을 동기화한다.
  const RATTLE_STEP_PCTS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88];

  async function startPrint() {
    window.LabelSound && window.LabelSound.init();

    state.isPrinting = true;
    printBtn.disabled = true;

    labelDownloadBtn.hidden = true;
    labelCanvas.classList.remove('is-printing');
    labelCanvas.classList.remove('is-visible');
    void labelCanvas.offsetWidth; // 강제 리플로우 — 클래스 제거가 먼저 반영되게 함

    const { width, height, lineCount } = await window.LabelRenderer.drawLabel(labelCanvas, buildRenderOpts(2));

    // 화면 표시 크기 반영: 멀티라인으로 캔버스가 세로로 길어진 만큼, 화면에 보이는
    // label-canvas 엘리먼트도 실제 렌더 비율(width:height)에 맞춰 커진다.
    // max-width(92cqw, CSS)는 그대로 상한으로 유지 — width 지정 후 height:auto로 비율 유지.
    labelCanvas.style.width = width + 'px';
    labelCanvas.style.height = height + 'px';

    // 줄 수에 비례해 급지 애니메이션 총 시간 결정: 기본 2000ms + 줄당 250ms.
    const lines = Math.max(1, lineCount || 1);
    const totalMs = 2000 + (lines - 1) * 250;
    machineEl.style.setProperty('--anim-print', totalMs + 'ms');
    labelCanvas.style.setProperty('--anim-print', totalMs + 'ms');

    window.LabelSound && window.LabelSound.playPrintStart();
    machineEl.classList.add('is-shaking');
    setTimeout(() => machineEl.classList.remove('is-shaking'), totalMs);

    // 드르륵 스텝 사운드 — CSS keyframe 퍼센트와 동일한 지점에서, 실제 totalMs 기준으로
    // setTimeout 시퀀스 재생(음소거 연동은 LabelSound.playPrintRattleStep 내부에서 처리).
    RATTLE_STEP_PCTS.forEach((pct) => {
      setTimeout(() => {
        window.LabelSound && window.LabelSound.playPrintRattleStep();
      }, (pct / 100) * totalMs);
    });

    // rAF에 의존하지 않고 CSS 트랜지션을 확실히 트리거한다(헤드리스 환경에서 rAF가
    // 스로틀되는 문제 회피, DEVLOG 2026-07-05(4차) 기록 참고). is-visible이 먼저
    // display:block을 만들고, 강제 리플로우 후 is-printing을 붙여 트랜지션 시작점을
    // 브라우저가 확실히 인식하게 한다. setTimeout(0)은 페인트 유예를 위한 최소한의 매크로태스크.
    labelCanvas.classList.add('is-visible');
    void labelCanvas.offsetWidth;
    setTimeout(() => {
      labelCanvas.classList.add('is-printing');
    }, 0);

    setTimeout(() => {
      // 애니메이션이 끝까지 재생됐든(정상 브라우저), 타이머가 멈춰 0%에 머물렀든(헤드리스
      // 환경, DEVLOG 2026-07-05(4차) 기록과 동일한 rAF/애니메이션 타이머 스로틀 한계) —
      // 여기서 is-printing을 떼어내면 남은 is-visible 하나만으로 "슬롯 위 최종 정지 상태"
      // (기본 transform: translateY(0) rotateX(0), opacity:1)에 무조건 도달한다.
      labelCanvas.classList.remove('is-printing');
      showToast();
      labelDownloadBtn.hidden = false;
      state.isPrinting = false;
      printBtn.disabled = false;
    }, totalMs);
  }

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
    await window.LabelRenderer.downloadLabelPng(buildRenderOpts(3));
    resetToInitialScreen();
  });

  // PNG 저장(다운로드 트리거) 후 처음 화면으로 리셋 — 사용자가 바로 새 라벨을 쓸 수 있게.
  // 텍스트 버퍼/토큰/caret을 비우고, 출력된 라벨 엘리먼트를 제거하고, PNG 저장 버튼을
  // 숨기고, LCD를 초기 플레이스홀더로, mode를 text로, 키보드 레이어를 한글 기본으로 되돌린다.
  function resetToInitialScreen() {
    handleClearAll(); // tokens/composer/caret 비움 + renderLcd() 호출

    state.mode = 'text';
    state.confirmSource = null;

    // 출력된 라벨 엘리먼트 제거: is-visible/is-printing 클래스 해제 + display:none으로
    // 되돌리고, 캔버스 픽셀도 지워 다음 렌더 전까지 잔상이 안 남게 한다.
    labelCanvas.classList.remove('is-visible', 'is-printing');
    labelCanvas.style.width = '';
    labelCanvas.style.height = '';
    const lctx = labelCanvas.getContext('2d');
    if (lctx) lctx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);

    labelDownloadBtn.hidden = true;

    // 키보드 레이어를 한글 기본으로 복귀(영문/이모지 상태로 저장했을 수 있으므로).
    if (state.kbLayer !== 'hangul') {
      state.kbLayer = 'hangul';
      state.prevTextLayer = 'hangul';
      state.shift = false;
      machineImgEl.src = MACHINE_IMG_SRC.hangul;
      renderKeyboard();
    }

    renderLcd();
  }

  // --------------------------------------------------------------------
  // 음소거 아이콘 토글
  // --------------------------------------------------------------------
  const muteBtn = document.getElementById('muteBtn');
  function syncMuteBtn() {
    const muted = window.LabelSound && window.LabelSound.isMuted();
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(!!muted));
  }
  muteBtn.addEventListener('click', () => {
    window.LabelSound && window.LabelSound.init();
    const next = !(window.LabelSound && window.LabelSound.isMuted());
    window.LabelSound && window.LabelSound.setMuted(next);
    syncMuteBtn();
  });

  // --------------------------------------------------------------------
  // 초기화
  // --------------------------------------------------------------------
  function init() {
    buildGlyphSvgStrings();
    renderOvals();
    renderKeyboard();
    renderLcd();
    syncMuteBtn();
    focusHiddenInputSilently();
  }

  init();
})();
