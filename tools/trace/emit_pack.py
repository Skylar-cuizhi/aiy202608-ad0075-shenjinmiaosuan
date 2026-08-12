#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把调研报告与管线产出的 sources.json 合成「溯源包」JSON，可直接导入见微的调研溯源模块。

用法：
    python3 tools/trace/emit_pack.py <调研报告.md> <sources.json> [输出 pack.json]
"""
import json, os, re, sys


def main():
    report_path = os.path.abspath(sys.argv[1])
    sources_path = os.path.abspath(sys.argv[2])
    out_path = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else "trace-pack.json"

    report_md = open(report_path, encoding="utf-8").read()
    sources_path_dir = os.path.dirname(sources_path)
    norm_path = os.path.join(sources_path_dir, "report.normalized.md")
    if os.path.exists(norm_path):  # 管线做过脚注归一化时，溯源包用归一化后的报告（引证可点击）
        report_md = open(norm_path, encoding="utf-8").read()
    sources = json.load(open(sources_path, encoding="utf-8"))

    m = re.search(r"^#\s+(.+)$", report_md, re.M)
    title = m.group(1).strip() if m else os.path.splitext(os.path.basename(report_path))[0]

    pack = {"title": title, "reportMd": report_md, "sources": sources}
    json.dump(pack, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    ok = sum(1 for s in sources if s.get("status") == "ok")
    matched = sum(1 for s in sources for a in s.get("anchors", []) if a.get("matched"))
    print(f"溯源包已生成：{out_path}")
    print(f"标题：{title} ｜ 来源 {len(sources)}（可获取 {ok}） ｜ 锚点 {matched}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    main()
