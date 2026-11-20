# 관절 추정(또는 우리 게임의 관절 자리)에서 자세 지표를 뽑는다. 사용: python3 -I pose_metrics.py <json> [시작초] [끝초] [이름]
# 입력: pose_extract.py의 결과(영상) 또는 { fps, frames:[{t, ok, img:[[x,y,vis]…33], world:[[x,y,z]…33]}] } 같은 꼴(우리 게임 것은 tools/video/game_pose.mjs가 만든다)
# 영상 쪽은 단안 추정값이다(시점·가림 오차). 각도는 "화면에서 본 각도"와 "추정 3D 각도"를 구분한다
import sys, json, math
d = json.load(open(sys.argv[1])); t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0; t1 = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9; name = sys.argv[4] if len(sys.argv) > 4 else sys.argv[1]
F = [f for f in d['frames'] if f.get('ok') and t0 <= f['t'] <= t1]
asp = d.get('w', 1) / d.get('h', 1)
def ang3(a, b, c):
    u = [a[i] - b[i] for i in range(3)]; v = [c[i] - b[i] for i in range(3)]
    n = math.sqrt(sum(x * x for x in u)) * math.sqrt(sum(x * x for x in v))
    return math.degrees(math.acos(max(-1, min(1, sum(u[i] * v[i] for i in range(3)) / n)))) if n > 1e-9 else float('nan')
P2 = lambda f, i: (f['img'][i][0] * asp, f['img'][i][1])
mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
dist = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
rows = {k: [] for k in ['몸통 기울기(화면, 세로에서)', '어깨 선 기울기(화면)', '골반 선 기울기(화면)', '어깨 선 − 골반 선', '무릎 굽힘 왼(3D, 180=폄)', '무릎 굽힘 오른', '팔꿈치 굽힘 왼', '팔꿈치 굽힘 오른', '발 간격 ÷ 어깨 너비', '손 간격 ÷ 어깨 너비', '엉덩이 가운데의 좌우 자리 ÷ 어깨 너비(두 발 가운데 기준)']}
ts = []
for f in F:
    W = f['world']; ls, rs, lh, rh = P2(f, 11), P2(f, 12), P2(f, 23), P2(f, 24); sw = dist(ls, rs) or 1e-6
    ms, mh = mid(ls, rs), mid(lh, rh)
    line = lambda a, b: math.degrees(math.atan2(-(a[1] - b[1]), abs(a[0] - b[0]) + 1e-9))
    tor = math.degrees(math.atan2(ms[0] - mh[0], -(ms[1] - mh[1])))
    sh, hp = line(ls, rs) * (1 if ls[0] > rs[0] else -1), line(lh, rh) * (1 if lh[0] > rh[0] else -1)
    la, ra = P2(f, 27), P2(f, 28); mf = mid(la, ra)
    v = [tor, sh, hp, sh - hp, ang3(W[23], W[25], W[27]), ang3(W[24], W[26], W[28]), ang3(W[11], W[13], W[15]), ang3(W[12], W[14], W[16]), dist(la, ra) / sw, dist(P2(f, 15), P2(f, 16)) / sw, (mh[0] - mf[0]) / sw]
    for k, x in zip(rows, v): rows[k].append(x)
    ts.append(f['t'])
def pct(a, p): b = sorted(x for x in a if x == x); return b[min(len(b) - 1, int(p * (len(b) - 1) + 0.5))] if b else float('nan')
print(f"## {name} · {len(F)}장 · {ts[0]:.1f}~{ts[-1]:.1f}초")
print('| 지표 | 5% | 가운데 | 95% | 오간 폭 | 1초에 바뀌는 양(가운데값) |'); print('|---|---|---|---|---|---|')
for k, a in rows.items():
    rate = sorted(abs(a[i + 1] - a[i]) / max(1e-6, ts[i + 1] - ts[i]) for i in range(len(a) - 1) if a[i] == a[i] and a[i + 1] == a[i + 1])
    f2 = (lambda x: f"{x:.2f}") if '÷' in k else (lambda x: f"{x:.0f}")
    print(f"| {k} | {f2(pct(a, .05))} | {f2(pct(a, .5))} | {f2(pct(a, .95))} | {f2(pct(a, .95) - pct(a, .05))} | {f2(rate[len(rate) // 2]) if rate else '-'} |")
