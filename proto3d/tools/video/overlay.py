# 추정한 관절을 영상 장면 위에 겹쳐 한 줄로 늘어놓는다(추정이 맞는지 눈으로 확인). 사용: python3 -I overlay.py <pose json> <결과 jpg> <시각 …>
import sys, json, cv2, numpy as np
d = json.load(open(sys.argv[1])); out = sys.argv[2]; times = [float(x) for x in sys.argv[3:]]
cap = cv2.VideoCapture(d['video']); W, H = d['w'], d['h']
E = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28), (27, 31), (28, 32), (0, 11), (0, 12)]
cells = []
for t in times:
    f = min((x for x in d['frames'] if x['ok']), key=lambda x: abs(x['t'] - t))
    cap.set(cv2.CAP_PROP_POS_MSEC, f['t'] * 1000); ok, img = cap.read()
    P = [(int(p[0] * W), int(p[1] * H)) for p in f['img']]
    for a, b in E: cv2.line(img, P[a], P[b], (0, 255, 255) if (a % 2 == 1 and b % 2 == 1) else (255, 128, 0) if (a % 2 == 0 and b % 2 == 0) else (255, 255, 255), 3)
    xs = [p[0] for p in P]; ys = [p[1] for p in P]; cx, cy = (min(xs) + max(xs)) // 2, (min(ys) + max(ys)) // 2; s = max(max(xs) - min(xs), max(ys) - min(ys)) // 2 + 40
    x0, y0 = max(0, cx - s), max(0, cy - s); crop = img[y0:y0 + 2 * s, x0:x0 + 2 * s]; crop = cv2.resize(crop, (230, int(230 * crop.shape[0] / crop.shape[1])))
    crop = cv2.copyMakeBorder(crop, 0, max(0, 260 - crop.shape[0]), 0, 0, cv2.BORDER_CONSTANT)[:260]
    cv2.putText(crop, '%.1fs' % f['t'], (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1); cells.append(crop)
cv2.imwrite(out, np.hstack(cells))
