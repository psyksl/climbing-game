# 분할 zip의 앞쪽 조각만으로 완전히 들어 있는 항목을 푼다(중앙 목록 없이 로컬 헤더를 차례로). 이름 그대로 저장, 잘린 항목은 .partial
import struct, zlib, sys, mmap, os
src, outdir = sys.argv[1], sys.argv[2]
f = open(src, 'rb'); mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
pos = mm.find(b'PK\x03\x04'); n = 0
while pos >= 0:
    ver, flag, meth, t, d, crc, cs, us, nl, el = struct.unpack('<HHHHHIIIHH', mm[pos+4:pos+30])
    raw = mm[pos+30:pos+30+nl]
    try: nm = raw.decode('utf-8')
    except: nm = raw.decode('cp949', 'replace')
    start = pos + 30 + nl + el; base = os.path.basename(nm.replace('\\', '/')) or f'item{n}'
    if nm.endswith('/'): pos = mm.find(b'PK\x03\x04', start); continue
    out = os.path.join(outdir, base)
    if meth == 8:
        dobj = zlib.decompressobj(-15); w = open(out + '.tmp', 'wb'); i = start; tot = 0; c = 0
        while i < len(mm) and not dobj.eof:
            chunk = mm[i:i + (1 << 20)]; i += len(chunk)
            b = dobj.decompress(chunk); w.write(b); tot += len(b); c = zlib.crc32(b, c)
        w.close(); ok = dobj.eof
        used = (i - len(dobj.unused_data) - start) if ok else (i - start); nxt = start + used
    else:
        end = start + cs if cs not in (0, 0xffffffff) else len(mm); data = mm[start:min(end, len(mm))]
        open(out + '.tmp', 'wb').write(data); tot = len(data); ok = end <= len(mm); c = zlib.crc32(data); nxt = min(end, len(mm))
    crc_ok = (crc == 0 and flag & 8) or c == crc
    if flag & 8 and ok:  # 데이터 서술자의 crc
        dd = mm[nxt:nxt+16]; o = 4 if dd[:4] == b'PK\x07\x08' else 0; crc_ok = struct.unpack('<I', dd[o:o+4])[0] == c
    os.replace(out + '.tmp', out if ok else out + '.partial')
    print(f'{base}: {"완전" if ok else "잘림"} {tot/1e6:.1f}MB crc {"맞음" if ok and crc_ok else "-"}')
    if not ok: break
    pos = mm.find(b'PK\x03\x04', nxt); n += 1
