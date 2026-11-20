# 영상 장면을 사람 둘레로 잘라 한 줄로 늘어놓는다(겹쳐 그리지 않음. 눈으로 보는 용도). 사용: python3 -I strip.py <pose json> <결과 jpg> <칸 너비> <시각 …>
import sys, json, cv2, numpy as np
d = json.load(open(sys.argv[1])); out = sys.argv[2]; cw = int(sys.argv[3]); times = [float(x) for x in sys.argv[4:]]
cap = cv2.VideoCapture(d['video']); W, H = d['w'], d['h']; cells = []
for t in times:
    f = min((x for x in d['frames'] if x['ok']), key=lambda x: abs(x['t'] - t))
    cap.set(cv2.CAP_PROP_POS_MSEC, f['t'] * 1000); ok, img = cap.read()
    P = [(int(p[0] * W), int(p[1] * H)) for p in f['img'] if p[2] > 0.3] or [(W // 2, H // 2)]
    xs = [p[0] for p in P]; ys = [p[1] for p in P]; cx, cy = (min(xs) + max(xs)) // 2, (min(ys) + max(ys)) // 2; s = max(max(xs) - min(xs), max(ys) - min(ys)) // 2 + 50
    x0, y0 = max(0, min(W - 2 * s, cx - s)), max(0, min(H - 2 * s, cy - s)); crop = img[y0:y0 + 2 * s, x0:x0 + 2 * s]; crop = cv2.resize(crop, (cw, cw), interpolation=cv2.INTER_CUBIC)
    crop = cv2.convertScaleAbs(crop, alpha=1.25, beta=12); cv2.putText(crop, '%.1fs' % f['t'], (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1); cells.append(crop)
cv2.imwrite(out, np.hstack(cells), [cv2.IMWRITE_JPEG_QUALITY, 85])
