#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
txt = open('reports/crm2/umi.js', encoding='utf-8', errors='ignore').read()
print("== detail 路由 ==")
for m in re.finditer(r'path:"([^"]*detail[^"]*)"', txt):
    print("  route:", m.group(1))
print("== 含 分派/Assign 且带 url/api/route/push 的上下文 ==")
for m in re.finditer(r'.{30}(Assign|分派|Redeploy|转派).{130}', txt):
    s = m.group(0)
    if any(k in s for k in ['url', 'Api', 'route', 'push', 'href', '/api/', 'path', 'location']):
        print("  ", s.replace('\n', ' ')[:210])
print("== 找 workOrder detail 相关组件名 ==")
for m in re.finditer(r'name:"([^"]*([Ww]ork[Oo]rder|[Dd]etail|Process|Handle|Deal)[^"]*)"', txt):
    print("  name:", m.group(1))
