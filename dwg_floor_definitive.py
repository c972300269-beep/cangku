# -*- coding: utf-8 -*-
"""Definitive floor assignment: map sheet-title / floor text to the two hydrant clusters.
Also count hydrants per cluster. Transparent: prints raw inventory so the user can verify."""
import sys, math
sys.path.insert(0, "C:/Users/chenjialin3/.workbuddy/tmp/dwg/pylibs")
import ezdxf

DXF = ".workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

XHS = "$TwtSys$00000545"
BOX = "A$C3ECF3B2E"

def wcs_matrix(insert):
    """Return list of (x,y) world points of the two 545 inside a BOX insert."""
    pts = []
    try:
        blk = doc.blocks.get(insert.dxf.name)
    except Exception:
        return pts
    # collect nested 545 with transforms
    def walk(entities, M):
        import ezdxf
        for e in entities:
            t = e.dxftype()
            if t == "INSERT":
                # build local matrix
                from ezdxf.math import Matrix44
                ins = e.dxf.insert
                sx = e.dxf.xscale if hasattr(e.dxf, 'xscale') else 1.0
                sy = e.dxf.yscale if hasattr(e.dxf, 'yscale') else 1.0
                rot = e.dxf.rotation if hasattr(e.dxf, 'rotation') else 0.0
                M2 = M * Matrix44.scale(sx, sy, 1) * Matrix44.z_rotate(math.radians(rot)) * Matrix44.translate(ins[0], ins[1], ins[2])
                if e.dxf.name == XHS:
                    p = M2.transform((0, 0, 0))
                    pts.append((p[0], p[1]))
                else:
                    try:
                        walk(doc.blocks.get(e.dxf.name), M2)
                    except Exception:
                        pass
            else:
                pass
    from ezdxf.math import Matrix44
    ins = insert.dxf.insert
    sx = insert.dxf.xscale if hasattr(insert.dxf, 'xscale') else 1.0
    sy = insert.dxf.yscale if hasattr(insert.dxf, 'yscale') else 1.0
    rot = insert.dxf.rotation if hasattr(insert.dxf, 'rotation') else 0.0
    M0 = Matrix44.scale(sx, sy, 1) * Matrix44.z_rotate(math.radians(rot)) * Matrix44.translate(ins[0], ins[1], ins[2])
    walk(blk, M0)
    return pts

# ---- collect all hydrant 545 world points ----
single_pts = []
double_pts = []
for e in msp:
    if e.dxftype() != "INSERT":
        continue
    if e.dxf.name == XHS:
        single_pts.append((e.dxf.insert[0], e.dxf.insert[1]))
    elif e.dxf.name == BOX:
        double_pts.extend(wcs_matrix(e))

allpts = single_pts + double_pts
# cluster by X gap
xs = sorted(set(round(p[0]) for p in allpts))
# find largest gap
gap_best = (0, 0, 0)
prev = xs[0]
for x in xs[1:]:
    g = x - prev
    if g > gap_best[0]:
        gap_best = (g, prev, x)
    prev = x
split = (gap_best[1] + gap_best[2]) / 2
print("X gap max = %.0f  (between %.0f and %.0f), split X = %.0f" % (gap_best[0], gap_best[1], gap_best[2], split))

left = [p for p in allpts if p[0] < split]
right = [p for p in allpts if p[0] >= split]
print("LEFT cluster  boxes(outlets) = %d" % len(left))
print("RIGHT cluster boxes(outlets) = %d" % len(right))
print("TOTAL outlets = %d  (single %d + double %d)" % (len(allpts), len(single_pts), len(double_pts)))

# ---- text extraction ----
def get_text(e):
    t = e.dxftype()
    s = ""
    if t == "TEXT":
        s = e.dxf.text
    elif t == "MTEXT":
        s = e.text
    else:
        return None, None
    try:
        x = e.dxf.insert[0]; y = e.dxf.insert[1]
    except Exception:
        return s, None
    return s, (x, y)

floor_terms = ["负一层", "负二层", "地下一层", "地下二层", "负一", "负二", "B1", "B2", "地下一", "地下二"]
sheet_terms = ["A1-1", "A1-2", "A1-3", "A2-1", "A2-2", "A2-3", "A2-4", "A2-5", "A2-6", "放大平面", "给排水及消火栓", "地下室"]

def bin_of(pt):
    if pt is None:
        return "?"
    if pt[0] < split:
        return "L"
    return "R"

left_texts = []
right_texts = []
other_texts = []
for e in msp:
    if e.dxftype() not in ("TEXT", "MTEXT"):
        continue
    s, pt = get_text(e)
    if not s:
        continue
    s2 = s.replace(" ", "")
    if any(k in s2 for k in floor_terms + sheet_terms):
        b = bin_of(pt)
        rec = (b, pt, s.strip())
        if b == "L":
            left_texts.append(rec)
        elif b == "R":
            right_texts.append(rec)
        else:
            other_texts.append(rec)

# Deduplicate by (rounded pos + text) to avoid MTEXT/TEXT dup noise
def dedupe(recs):
    seen = set(); out = []
    for b, pt, s in recs:
        key = (b, round(pt[0], -2) if pt else 0, round(pt[1], -2) if pt else 0, s[:20])
        if key in seen:
            continue
        seen.add(key); out.append((b, pt, s))
    return out

left_texts = dedupe(left_texts)
right_texts = dedupe(right_texts)

def count_floor(recs):
    c = {"负一层":0, "负二层":0, "地下一层":0, "地下二层":0}
    for b, pt, s in recs:
        if "负一层" in s or "地下一层" in s or "负一" in s:
            c["负一层"] += 1
        if "负二层" in s or "地下二层" in s or "负二" in s:
            c["负二层"] += 1
    return c

print("\n=== LEFT cluster floor/sheet texts (%d unique) ===" % len(left_texts))
print("  floor hits:", count_floor(left_texts))
for b, pt, s in sorted(left_texts, key=lambda r: (r[1][1] if r[1] else 0)):
    print("  [L] (%.0f,%.0f) %s" % (pt[0], pt[1], s[:60]))

print("\n=== RIGHT cluster floor/sheet texts (%d unique) ===" % len(right_texts))
print("  floor hits:", count_floor(right_texts))
for b, pt, s in sorted(right_texts, key=lambda r: (r[1][1] if r[1] else 0)):
    print("  [R] (%.0f,%.0f) %s" % (pt[0], pt[1], s[:60]))

print("\n=== OTHER (outside clusters) floor/sheet texts (%d) sample ===" % len(other_texts))
for b, pt, s in other_texts[:40]:
    print("  [?] (%.0f,%.0f) %s" % (pt[0] if pt else 0, pt[1] if pt else 0, s[:60]))
