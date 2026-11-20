# 영상에서 관절 추정(MediaPipe Pose Landmarker). 사용: python3 -I pose_extract.py <영상> <모델> <결과 json> [시작초] [끝초] [걸러뛰기]
# 결과는 "추정값"이다(단안 영상, 가림·시점 오차 있음). 사람의 정답 값이 아니다.
import sys, json, cv2
import mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision
video, model, out = sys.argv[1:4]
t0 = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
t1 = float(sys.argv[5]) if len(sys.argv) > 5 else 1e9
skip = int(sys.argv[6]) if len(sys.argv) > 6 else 1
opt = vision.PoseLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.VIDEO, num_poses=1, min_pose_detection_confidence=0.4, min_pose_presence_confidence=0.4, min_tracking_confidence=0.4)
cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
frames = []; i = -1
with vision.PoseLandmarker.create_from_options(opt) as lm:
    while True:
        ok, img = cap.read()
        if not ok: break
        i += 1; t = i / fps
        if t < t0 or i % skip: continue
        if t > t1: break
        r = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), int(t * 1000))
        if not r.pose_landmarks: frames.append({'t': round(t, 3), 'ok': False}); continue
        frames.append({'t': round(t, 3), 'ok': True, 'img': [[round(p.x, 4), round(p.y, 4), round(p.visibility, 2)] for p in r.pose_landmarks[0]], 'world': [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in r.pose_world_landmarks[0]]})
h, w = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)), int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
json.dump({'video': video, 'fps': fps, 'w': w, 'h': h, 'skip': skip, 'frames': frames}, open(out, 'w'))
print('frames', len(frames), 'detected', sum(f['ok'] for f in frames), 'fps', fps, w, h)
