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
- 기호는 오버레이 패널(`.symbol-overlay`, 사진에 없는 계층이라 CSS로 그림) — 유니코드 20종 + 글리프 SVG 10종, 콤보 프리셋 없음(개별 문자만).
- LCD는 `DotGothic16`(Google Fonts, 픽셀폰트) 전용 — 출력 라벨(Canvas 렌더)은 Jua/Gaegu/고딕 그대로, 절대 혼용 금지.
- 라벨 배경은 `assets/label-texture.png`(실제 라벨지 사진을 alpha 마스킹한 텍스처, `js/render.js`가 Canvas cover로 그림). 재생성 시 Node `jimp` 필요(`npm install jimp`, 1회성 전처리 도구라 node_modules는 커밋하지 않음).
- 사운드는 `js/sound.js` — 외부 파일/API 없이 Web Audio API로 전부 합성. 핑크버튼 전용 `playClick()`(딸깍음) 포함.
- 375px에서 키보드 히트존이 44px 터치 타겟에 크게 못 미치는 것은 "사진+투명 히트존" 방식의 구조적 한계로 인정된 상태(개선 시도 시 이 한계를 먼저 참고).

## 문서
- `docs/PLAN.md` 계획·결정, `docs/DEVLOG.md` 작업일지(최신이 위).
