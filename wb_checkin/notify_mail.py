#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""签到失败/跳过时的邮件通知（QQ SMTP 兜底，Agent Mail 工具不可用时用）"""

import smtplib
import sys
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr

SMTP_SERVER = 'smtp.qq.com'
SMTP_PORT = 465
SENDER_EMAIL = '972300269@qq.com'
AUTH_CODE = '__QQ_AUTH_CODE__'
RECEIVER_EMAIL = '972300269@qq.com'


def send(subject, body):
    is_html = body.lstrip().startswith('<')
    msg = MIMEText(body, 'html' if is_html else 'plain', 'utf-8')
    msg['From'] = formataddr(('WorkBuddy自动监控', SENDER_EMAIL))
    msg['To'] = RECEIVER_EMAIL
    msg['Subject'] = Header(subject, 'utf-8')
    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=30) as s:
        s.login(SENDER_EMAIL, AUTH_CODE)
        s.sendmail(SENDER_EMAIL, [RECEIVER_EMAIL], msg.as_string())
    print('MAIL_SENT_OK')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('usage: notify_mail.py <subject> <body_file>')
        sys.exit(2)
    subj = sys.argv[1]
    if subj.strip().upper() == 'AUTO':
        from datetime import datetime
        subj = 'BPM每日简报 ' + datetime.now().strftime('%Y-%m-%d')
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        body = f.read()
    send(subj, body)
