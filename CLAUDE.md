# labelmaker

가상 라벨프린터 인터랙티브 웹. 화면 중앙의 귀여운 라벨기기에 문구·이모지를 입력하면 라벨이 주르륵 출력되고, 투명배경 사각 라벨 스티커 PNG로 다운로드한다.

## 스택
- Vanilla HTML/CSS/JS. 빌드 도구 없음. 정적 사이트 (Vercel/GitHub Pages 배포 예정).
- 서버·AI API 없음 — 전부 클라이언트 Canvas/SVG.

## 규칙
- UI 작업 전 `docs/design-tokens.md`를 먼저 읽는다. 토큰 밖 색·간격·크기 금지.
- YAGNI: v1 스코프(docs/PLAN.md) 밖 기능 생성 금지 (계정, 공유, 갤러리, PDF 시트는 다음 단계).
- 캐릭터·장식 글리프는 전부 오리지널 SVG — 산리오/리락쿠마 등 기존 IP 모사 금지.
- **키보드 = "몸체 트림 이미지 + 오버레이" 방식 (2026-07-05 4차 근본 재작업)**. `assets/머신한글키보드.png`/`머신영어02.png` 원본(투명 여백 포함)을 Python PIL로 몸체만 크롭해 `assets/kr_trim.png`(1096×792) / `assets/en_trim.png`(1095×790)로 저장했고, 이제 이 트림 이미지를 `<img class="machine-img" id="machineImg">`로 직접 표시한다. `.machine-overlay`(position:absolute; inset:0)가 그 위에 덮이므로 오버레이 안의 %는 트림 이미지 크기에 항상 정확히 대응한다 — "몸체 바운딩박스 기준 %를 여백 포함 원본에 적용해서 어긋나던" 이전 세션의 근본 원인이 구조적으로 제거됨. 한/영 전환은 `machineImgEl.src`를 `kr_trim.png`↔`en_trim.png`로 교체 + `js/app.js`의 좌표맵 교체(`state.kbLayer`). 모든 좌표는 트림 이미지 기준 픽셀 스캔 재실측(크림 키캡 vs 노란 데크 색 구분, LCD 초록/핑크 색 마스크) + 자동 검산(각 히트존 중심 샘플이 키캡 위인지)으로 100% 통과 확인. 상세는 `docs/design-tokens.md`·`docs/DEVLOG.md` 참고. 옛 `machine03.png`/`.machine-body` 배경이미지 방식은 완전히 폐기됨.
- `state.mode`: `'text' | 'settings' | 'confirm'`. 환경 오벌로 text↔settings, 핑크버튼/인쇄 오벌로 confirm(출력확인 "예/아니오") 진입.
- 한글 R2 자모 배열에 **ㅔ 키가 실제로 없다**(사진 실측 결과, 사용자 관찰과 불일치) — ㅐ→ㅒ만 지원, ㅔ/ㅖ는 이 기기로 입력 불가. 코드가 아니라 에셋 자체의 한계이니 향후 다른 사진으로 교체하지 않는 한 고칠 수 없음.
- **이모티콘 = 3번째 키보드 이미지 레이어 (2026-07-05 9차)**. 떠있던 CSS 기호 오버레이 패널(`.symbol-overlay`)은 완전히 폐기됨. `assets/emoji_trim.png`(1095×792, kr_trim/en_trim과 동일 챠시)가 세 번째 `machineImgEl.src` 후보 — 이모티콘 키 클릭 시 한/영 전환과 동일한 방식(이미지 src 교체 + 좌표맵 교체)으로 전환된다. R2/R3/R4 이모지 히트존은 기존 KR 좌표(`R2_KR_RECTS` 등)를 그대로 재사용(검산 30/30 100% 통과, 재측정 불필요). 이모지 토큰(`type:'emoji', id`)은 `assets/emoji/*.png`(17개, `assets/emoji-sheet.png`를 PIL 연결요소 검출로 슬라이스 후 잉크색 `#3A3330` 틴트)를 참조, LCD·라벨(render.js) 양쪽에 `drawImage`로 인라인 렌더. 다시 이모티콘 키(레이어 안에선 "가나다 복귀" 라벨)를 누르면 `state.prevTextLayer`(진입 전 한글/영문)로 복귀. R3의 9번째 칸은 사진 자체에 빈 키캡이라 히트존을 생성하지 않음(`key:null`), R4의 Shift는 이 레이어에서 의미 없어 비활성 처리.
- LCD와 라벨 출력물(Canvas 렌더) 폰트는 모두 `Galmuri11`(jsDelivr npm CDN, 도트 픽셀폰트) 고정. 폴백 체인 `Galmuri11 → NeoDunggeunmo → DungGeunMo → DotGothic16 → monospace`. Jua/Gaegu/고딕 폰트 선택 UI는 2026-07-05(7차)에 완전히 폐기됨(HOME 설정 메뉴에 폰트 항목 없음).
- 라벨은 사진 텍스처(`assets/label-texture.png`, `라벨지모음.png`) 없이 전부 **Canvas 코드 렌더**로 그린다(2026-07-05(7차) 근본 교체 — 사진 방식은 기울고 배경이 묻어 폐기). 반듯한 라운드 사각(radius 8~12px, 기울기 0) + 선택된 테이프 단색 배경 + 대각선 비닐 광택 밴드 1줄(불투명도 15%, `docs/design-tokens.md`의 "라벨 출력물 예외" 참고) + Galmuri11 텍스트.
- 사운드는 `js/sound.js` — 외부 파일/API 없이 Web Audio API로 전부 합성. 핑크버튼 전용 `playClick()`(딸깍음) 포함.
- 375px에서 키보드 히트존이 44px 터치 타겟에 크게 못 미치는 것은 "사진+투명 히트존" 방식의 구조적 한계로 인정된 상태(개선 시도 시 이 한계를 먼저 참고).

## 문서
- `docs/PLAN.md` 계획·결정, `docs/DEVLOG.md` 작업일지(최신이 위).
