# 라벨메이커 (Label Maker) 🏷️

> 화면 속 귀여운 라벨프린터로 문구·이모지를 찍어 **라벨 스티커를 만들고 PNG로 저장**하는 인터랙티브 웹.
> 실물 감열 라벨기처럼 키를 누르고, LCD에 픽셀 글씨가 뜨고, 영수증처럼 라벨이 두두두 올라옵니다.

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Canvas](https://img.shields.io/badge/Canvas-000000?style=flat&logo=html5&logoColor=white)
![No Build](https://img.shields.io/badge/No_Build-정적_사이트-brightgreen?style=flat)

- **기간**: 2026.07 (개인 프로젝트)
- **목적**: 인터랙티브 프론트엔드 연습 + 배포 경험
- **스택**: Vanilla HTML/CSS/JS · Canvas · Web Audio API (빌드 도구·서버·외부 API 없음)

<img src="docs/img/labelmaker-device.png" width="520" alt="라벨메이커 기기">

*화면 중앙의 라벨프린터 하나로 모든 조작 — 키보드·설정·출력이 기기 안에서 이뤄진다.*

---

## 이렇게 동작해요

```
문구 입력 (온스크린 두벌식 / 실키보드 IME)
→ 환경 버튼으로 테이프색·프레임·사이즈 선택
→ 이모티콘 키로 이모지 자판 전환·삽입
→ 핑크 버튼 → "출력하시겠습니까? 예/아니오"
→ 슬롯에서 라벨이 영수증처럼 올라옴 → PNG 저장
```

*도트 폰트로 찍혀 나오는 라벨 스티커 — 테이프색 · 프레임 · 이모지가 반영된 투명 배경 PNG로 저장됩니다.*

## 주요 기능

| 기능 | 설명 |
|------|------|
| ⌨️ **이미지 키보드** | 실사 감열 라벨기 렌더 위에 투명 히트존을 얹어 진짜 키를 누르는 느낌. 한글·영문·이모지 3개 레이어를 이미지 교체로 전환 |
| 🔤 **두벌식 한글 조합** | 초성·중성·종성 오토마타 직접 구현, 온스크린 클릭과 실키보드 IME 모두 지원 |
| 📟 **픽셀 LCD** | 계산기식 단일 라인 가로 스크롤 — 넘친 글자는 창 밖으로 밀려 숨고 방향키로 되돌아봄. 픽셀 폰트(Galmuri) |
| 🎨 **꾸미기** | 테이프색 6종 · 프레임 6종 · 사이즈(스트립/정사각) · 이모지 스프라이트 |
| 🧾 **영수증 출력** | 감열 프린터처럼 단계적으로 끊기며 올라오는 애니메이션 + 멀티라인 자동 줄바꿈으로 라벨이 길어짐 |
| 🔊 **ASMR 사운드** | Web Audio로 합성한 키 입력음·출력음 (음소거 토글) |
| 💾 **PNG 저장** | Canvas로 렌더한 투명 배경 라벨을 다운로드, 저장 후 초기 화면으로 리셋 |

## 기술 노트

- **정렬**: AI 생성 기기 이미지의 여백을 트림한 뒤 `<img>` + `position:absolute; inset:0` 오버레이 구조로, 좌표 %가 이미지에 정확히 대응하게 설계. 각 히트존 중심이 실제 키캡 위에 있는지 픽셀 스캔으로 자동 검산.
- **라벨 렌더**: 사진 합성 대신 Canvas로 직접 그림 — 테이프색 배경 + 비닐 광택 + 도트 폰트(잉크색 단색) + 이모지 스프라이트.
- **의존성 0**: 프레임워크·번들러 없이 브라우저 표준(Canvas, Web Audio)만 사용.

## 실행 방법

```bash
# 정적 파일이라 아무 정적 서버로 열면 됩니다
npx serve .
# 또는
python -m http.server 5941
```

브라우저에서 `http://localhost:5941` 접속.

## 프로젝트 구조

```
├── index.html
├── css/style.css
├── js/
│   ├── app.js       # 상태·입력·키보드 레이어·설정·출력 플로우
│   ├── hangul.js    # 두벌식 조합 오토마타
│   ├── render.js    # 라벨 Canvas 렌더 (멀티라인·프레임·이모지)
│   └── sound.js     # Web Audio 합성음
├── assets/          # 기기 이미지 · 이모지 스프라이트
└── docs/            # 계획·작업일지
```

---

*개인 학습용 프로젝트입니다. 캐릭터·글리프는 오리지널 디자인으로 제작했습니다.*
