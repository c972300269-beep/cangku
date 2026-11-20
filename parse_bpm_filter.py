import json, re, sys

p = r"E:\workbuddy\Claw\.workbuddy\bpm_output\my_applying_requests.json"
raw = open(p, encoding="utf-8").read()
# 清洗 new Date(...) -> null 以便 json 解析（过滤不需要日期）
clean = re.sub(r"new Date\([^)]*\)", "null", raw)
try:
    data = json.loads(clean)
except Exception as e:
    print("JSON解析失败:", e)
    sys.exit(1)

kw_project = "龙湖苑"
kw_topic = ("监控", "安装")
total = data.get("total", 0)
hits = []
for c in data.get("children", []):
    desc = c.get("Description", "") or ""
    name = c.get("ProcessName", "") or ""
    sn = c.get("SerialNum", "")
    blob = desc + name
    if kw_project in blob and any(t in blob for t in kw_topic):
        hits.append((sn, name, desc))

print(f"总条数={total}, 命中龙湖苑+监控/安装={len(hits)}")
for sn, name, desc in hits:
    print("----")
    print("单号:", sn)
    print("流程:", name)
    print("描述:", desc)
