import re
s = open("reports/crm2/umi.js", encoding="utf-8", errors="ignore").read()
for kw in ['name:"Account"', 'ResponsibleAccount', 'ApprovalComments', 'FormatChangeData', 'changeFormData']:
    idxs = [m.start() for m in re.finditer(re.escape(kw), s)]
    print("\n== %s : %d ==" % (kw, len(idxs)))
    for i in idxs[:5]:
        print("----@%d----" % i)
        print(s[max(0, i-200):i+260])
        print()
