# 입력 UI 그림 (키캡 틀, 패널)

- 출처: `Climb_Input_UI_Handoff_v1`(사용자가 승인한 시안 묶음, 2026-11-18 전달). 인계 문서에 따르면 재질·패널·키와 마우스 원화는 이 프로젝트를 위해 생성한 그림이며, 손으로 만든 벡터 원본이나 상업적 독점권을 보증하지 않는다.
- `templates/*.png` 13종: 글자 없는 키캡·마우스 틀(square, short, tab, caps, backspace, enter, shift, space, numenter, numzero, iso, mouse, mouseSide). 인계 묶음의 파일 그대로다. 키 글자는 실행 중에 그린다.
- `panel.webp`: 인계 묶음의 `assets/panel.png`(2022×778, 2.2MB)를 절반 크기(1011×389)의 WebP로 줄인 것(28KB). 한 파일 빌드에 묻기 위해서다. 화면에서는 아홉 조각으로 늘려 그린다.
- 넣지 않은 것: 인계 묶음의 `assets/keys/`(코드별 PNG 579장, 참고 출력), `previews/`, `preview.html`. 실행에는 위 14개 파일만 쓴다.
- `node build.js`가 이 그림들을 `climb_lab.html`에 data 주소로 묻는다(외부 파일·통신 없음).
