import os, urllib.request, ssl

out_dir = r"E:\workbuddy\Claw\downloads"
os.makedirs(out_dir, exist_ok=True)

files = [
    ("CDQ3s_manual.pdf", "https://www.delixi-electric.com/u/cms/delixi/202207/05091816z9lg.pdf"),
    ("CDQ3s_sample.pdf", "https://www.delixi-electric.com/upload/pdf/CDQ3s%E6%A0%B7%E6%9C%AC.pdf"),
]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

for name, url in files:
    dest = os.path.join(out_dir, name)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=180) as resp:
            data = resp.read()
        with open(dest, "wb") as f:
            f.write(data)
        print(f"OK  {name}  {len(data)} bytes  <- {url}")
    except Exception as e:
        print(f"FAIL {name}: {e}")
