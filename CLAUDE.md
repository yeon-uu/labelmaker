# labelmaker

가상 라벨프린터 인터랙티브 웹. 화면 중앙의 귀여운 라벨기기에 문구·이모지를 입력하면 라벨이 주르륵 출력되고, 투명배경 사각 라벨 스티커 PNG로 다운로드한다.

## 스택
- Vanilla HTML/CSS/JS. 빌드 도구 없음. 정적 사이트 (Vercel/GitHub Pages 배포 예정).
- 서버·AI API 없음 — 전부 클라이언트 Canvas/SVG.

## 규칙
- UI 작업 전 `docs/design-tokens.md`를 먼저 읽는다. 토큰 밖 색·간격·크기 금지.
- YAGNI: v1 스코프(docs/PLAN.md) 밖 기능 생성 금지 (계정, 공유, 갤러리, PDF 시트는 다음 단계).
- 캐릭터·장식 글리프는 전부 오리지널 SVG — 산리오/리락쿠마 등 기존 IP 모사 금지.
- 기기 본체는 `assets/machine01.png`(GPT 생성 PNG, 알파 투명 컷아웃) 사용. LCD/슬롯/키보드는 이미지 위 실측 %좌표로 absolute 배치(2026-07-04 완료, 좌표는 docs/DEVLOG.md 참고).

## 문서
- `docs/PLAN.md` 계획·결정, `docs/DEVLOG.md` 작업일지(최신이 위).
