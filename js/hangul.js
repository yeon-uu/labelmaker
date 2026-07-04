/**
 * hangul.js — 두벌식 한글 조합 오토마타
 *
 * 유니코드 한글 음절 = 0xAC00 + (초성 * 21 + 중성) * 28 + 종성
 * 초성 19개, 중성 21개, 종성 28개(0=받침 없음).
 *
 * 온스크린 키보드 클릭 입력을 위한 상태머신을 제공한다.
 * 외부에는 HangulComposer 클래스만 노출.
 */
(function (global) {
  'use strict';

  // 초성 19
  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  // 중성 21
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  // 종성 28 (0번은 받침 없음)
  const JONG = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  const CHO_IDX = new Map(CHO.map((c, i) => [c, i]));
  const JUNG_IDX = new Map(JUNG.map((c, i) => [c, i]));
  const JONG_IDX = new Map(JONG.map((c, i) => [c, i]));

  // 겹받침 분해: 종성 -> [첫 자모, 두번째 자모]
  const JONG_SPLIT = {
    'ㄳ': ['ㄱ','ㅅ'], 'ㄵ': ['ㄴ','ㅈ'], 'ㄶ': ['ㄴ','ㅎ'],
    'ㄺ': ['ㄹ','ㄱ'], 'ㄻ': ['ㄹ','ㅁ'], 'ㄼ': ['ㄹ','ㅂ'],
    'ㄽ': ['ㄹ','ㅅ'], 'ㄾ': ['ㄹ','ㅌ'], 'ㄿ': ['ㄹ','ㅍ'],
    'ㅀ': ['ㄹ','ㅎ'], 'ㅄ': ['ㅂ','ㅅ']
  };
  // 두 자모를 합쳐 겹받침으로 만들 수 있는 조합 (역방향)
  const JONG_COMBINE = {
    'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ',
    'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ',
    'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ',
    'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ'
  };
  // 이중모음 합성 (단모음 + 단모음 -> 이중모음)
  const JUNG_COMBINE = {
    'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ',
    'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ',
    'ㅡㅣ': 'ㅢ'
  };
  // 이중모음 분해
  const JUNG_SPLIT = {
    'ㅘ': ['ㅗ','ㅏ'], 'ㅙ': ['ㅗ','ㅐ'], 'ㅚ': ['ㅗ','ㅣ'],
    'ㅝ': ['ㅜ','ㅓ'], 'ㅞ': ['ㅜ','ㅔ'], 'ㅟ': ['ㅜ','ㅣ'],
    'ㅢ': ['ㅡ','ㅣ']
  };

  function isCho(ch) { return CHO_IDX.has(ch); }
  function isJung(ch) { return JUNG_IDX.has(ch); }
  // 종성으로 쓰일 수 있는 자모(홑자음). ㄸ,ㅃ,ㅉ은 종성 불가.
  function isJongable(ch) {
    return JONG_IDX.has(ch) && ch !== '';
  }

  function composeSyllable(choCh, jungCh, jongCh) {
    const ci = CHO_IDX.get(choCh);
    const ji = JUNG_IDX.get(jungCh);
    const ti = jongCh ? JONG_IDX.get(jongCh) : 0;
    if (ci === undefined || ji === undefined || ti === undefined) return null;
    return String.fromCharCode(0xAC00 + (ci * 21 + ji) * 28 + ti);
  }

  function decomposeSyllable(syl) {
    const code = syl.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return null;
    const sIdx = code - 0xAC00;
    const cho = Math.floor(sIdx / (21 * 28));
    const jung = Math.floor((sIdx % (21 * 28)) / 28);
    const jong = sIdx % 28;
    return { cho: CHO[cho], jung: JUNG[jung], jong: JONG[jong] };
  }

  /**
   * HangulComposer: 한 음절 단위의 조합 상태를 관리하는 오토마타.
   * 외부(app.js)는 각 자모 입력마다 push(jamo)를 호출하고,
   * backspace()로 마지막 상태를 한 단계씩 되돌린다.
   * commit()으로 현재 조합 중인 음절을 확정하고 상태를 리셋한다.
   *
   * 상태: { cho, jung, jong } 중 존재하는 것만 채워짐.
   */
  class HangulComposer {
    constructor() {
      this.reset();
    }

    reset() {
      this.cho = null;
      this.jung = null;
      this.jong = null;
    }

    isEmpty() {
      return !this.cho && !this.jung && !this.jong;
    }

    // 현재 조합 상태를 하나의 문자(완성 음절 또는 단독 자모)로 렌더링
    render() {
      if (this.isEmpty()) return '';
      if (this.cho && this.jung) {
        const syl = composeSyllable(this.cho, this.jung, this.jong || '');
        return syl || '';
      }
      if (this.cho) return this.cho;
      if (this.jung) return this.jung;
      return '';
    }

    /**
     * 자모 하나를 입력. 반환값:
     * { committed: string|null, current: string }
     * committed: 조합이 종료되어 확정된 이전 음절(새 음절이 시작될 때)
     * current: 지금 조합 중인 표시 문자
     */
    push(jamo) {
      let committed = null;

      if (isCho(jamo) && !isJung(jamo)) {
        // 자음 입력
        if (!this.cho && !this.jung && !this.jong) {
          // 완전히 빈 상태 -> 새 초성
          this.cho = jamo;
        } else if (this.cho && !this.jung) {
          // 초성만 있는 상태에서 자음이 또 옴 -> 이전 초성 확정, 새 초성 시작
          committed = this.render();
          this.reset();
          this.cho = jamo;
        } else if (this.cho && this.jung && !this.jong) {
          // 초성+중성 상태에서 자음 -> 종성으로 시도
          if (isJongable(jamo)) {
            this.jong = jamo;
          } else {
            // 종성 불가 자음(ㄸ,ㅃ,ㅉ) -> 현재 음절 확정 후 새 초성
            committed = this.render();
            this.reset();
            this.cho = jamo;
          }
        } else if (this.cho && this.jung && this.jong) {
          // 종성이 이미 있는 상태에서 자음 추가 -> 겹받침 시도
          const combined = JONG_COMBINE[this.jong + jamo];
          if (combined) {
            this.jong = combined;
          } else {
            committed = this.render();
            this.reset();
            this.cho = jamo;
          }
        } else if (!this.cho && this.jung) {
          // 중성만 있는 상태(초성 없이 모음 단독 입력 후) -> 새 음절 초성
          committed = this.render();
          this.reset();
          this.cho = jamo;
        } else {
          committed = this.render();
          this.reset();
          this.cho = jamo;
        }
      } else if (isJung(jamo)) {
        // 모음 입력
        if (this.cho && this.jong) {
          // 초성+중성+종성 상태에서 모음 옴
          // -> 종성이 다음 음절의 초성으로 넘어가야 함 (예: "간"+ㅏ -> "가" + "나")
          const jongCh = this.jong;
          // 겹받침이면 마지막 자모만 넘기고 나머지는 남긴다
          if (JONG_SPLIT[jongCh]) {
            const [first, second] = JONG_SPLIT[jongCh];
            this.jong = first;
            committed = this.render();
            this.cho = second;
            this.jung = jamo;
            this.jong = null;
          } else {
            this.jong = null;
            committed = this.render();
            this.cho = jongCh;
            this.jung = jamo;
          }
        } else if (this.cho && this.jung && !this.jong) {
          // 중성이 이미 있는데 모음 추가 -> 이중모음 시도
          const combined = JUNG_COMBINE[this.jung + jamo];
          if (combined) {
            this.jung = combined;
          } else {
            // 이중모음 불가 -> 현재 확정, 초성 없는 새 모음 시작
            committed = this.render();
            this.reset();
            this.jung = jamo;
          }
        } else if (this.cho && !this.jung) {
          // 초성만 있는 상태 -> 중성 결합
          this.jung = jamo;
        } else if (!this.cho && this.jung) {
          // 모음만 있는 상태에서 모음 추가 -> 이중모음 시도
          const combined = JUNG_COMBINE[this.jung + jamo];
          if (combined) {
            this.jung = combined;
          } else {
            committed = this.render();
            this.reset();
            this.jung = jamo;
          }
        } else {
          this.jung = jamo;
        }
      } else {
        // 자모가 아닌 경우 무시
        return { committed: null, current: this.render() };
      }

      return { committed, current: this.render() };
    }

    /**
     * 백스페이스: 조합 중인 상태를 자모 단위로 한 칸 되돌린다.
     * 반환값: { current: string, empty: boolean }
     * empty가 true면 이 음절 조합이 완전히 비어 상위(app.js)에서
     * 이전에 커밋된 글자를 지워야 함을 의미.
     */
    backspace() {
      if (this.jong) {
        const split = JONG_SPLIT[this.jong];
        if (split) {
          this.jong = split[0];
        } else {
          this.jong = null;
        }
      } else if (this.jung) {
        const split = JUNG_SPLIT[this.jung];
        if (split) {
          this.jung = split[0];
        } else {
          this.jung = null;
        }
      } else if (this.cho) {
        this.cho = null;
      }

      const empty = this.isEmpty();
      return { current: this.render(), empty };
    }

    /**
     * 현재 조합 상태를 확정(커밋)하고 리셋한다.
     * 스페이스, 완성된 채로 넘어갈 때(문장부호 입력 등) 사용.
     */
    commit() {
      const result = this.render();
      this.reset();
      return result;
    }
  }

  global.Hangul = {
    HangulComposer,
    CHO, JUNG, JONG,
    isCho, isJung, isJongable,
    composeSyllable, decomposeSyllable
  };
})(typeof window !== 'undefined' ? window : globalThis);
