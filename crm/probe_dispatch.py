#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
txt = open('reports/crm2/umi.js', encoding='utf-8', errors='ignore').read()

def show(label, pat, n=8):
    print(f"\n== {label} ==")
    cnt = 0
    for m in re.finditer(pat, txt):
        s = m.group(0)
        print("  ", s.replace(chr(10),' ')[:240])
        cnt += 1
        if cnt >= n: break

# 分派 / 转派 真实转义
show("分派(\\u5206\\u6d3e)", r'.{0,60}\\u5206\\u6d3e.{0,160}')
show("转派(\\u8f6c\\u6d3e)", r'.{0,40}\\u8f6c\\u6d3e.{0,100}')
# 详情弹窗触发
show("详情(\\u8be6\\u60c5)", r'.{0,40}\\u8be6\\u60c5.{0,100}')
# GetWokerOrderDetail 用法
show("GetWokerOrderDetail", r'.{0,80}GetWokerOrderDetail.{0,120}')
# 打开详情的跳转
show("goDetail/openDetail", r'(goDetail|openDetail|showDetail|handleDetail|toDetail)[^a-zA-Z]')
# 处理按钮
show("处理(\\u5904\\u7406)按钮", r'.{0,50}\\u5904\\u7406.{0,80}')
