#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
txt = open('reports/crm2/umi.js', encoding='utf-8', errors='ignore').read()

print("== 所有 /admin/ 路由 ==")
for m in re.finditer(r'path:"(/admin/[^"]*)"', txt):
    print("  ", m.group(1))

print("\n== 含 '分派' 的片段(找按钮+接口) ==")
for i, m in enumerate(re.finditer(r'.{0,80}分派.{0,160}', txt)):
    s = m.group(0)
    print(f"  [{i}] {s.replace(chr(10),' ')[:240]}")

print("\n== 含 WorkOrder 且疑似派单的接口调用 ==")
for m in re.finditer(r'url:"[^"]*WorkOrder/[^"]*"', txt):
    print("  ", m.group(0))
