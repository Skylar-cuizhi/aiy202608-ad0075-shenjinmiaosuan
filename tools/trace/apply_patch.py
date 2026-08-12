#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""见微·溯源补录合并：把 WebBridge 浏览器补抓的原文（trace-patch/<id>.txt|pdf）合并回溯源包。

用法：
    python3 tools/trace/apply_patch.py <溯源包.json> [补抓目录]

- 仅处理 pack 中 status=fail 且存在对应补抓文件的来源；
- 重新做原文定位（locate），命中即生成标红锚点；
- 来源标注 provenance=浏览器补录，可追溯抓取方式；
- 结果就地写回溯源包 JSON。
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import locate  # noqa: E402

WORKSPACE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
PATCH_DIR = os.path.join(WORKSPACE, "trace-patch")


def patch_text(sid, patch_dir):
    txt = os.path.join(patch_dir, f"{sid}.txt")
    pdf = os.path.join(patch_dir, f"{sid}.pdf")
    if os.path.exists(txt):
        return open(txt, encoding="utf-8").read(), "WebBridge 浏览器补抓（HTML 正文）"
    if os.path.exists(pdf):
        from pypdf import PdfReader
        with open(pdf, "rb") as f:
            reader = PdfReader(io.BytesIO(f.read()))
        text = "\n".join((p.extract_text() or "") for p in reader.pages[:80])
        return text, "WebBridge 浏览器补抓（PDF 原文）"
    return None, None


def main():
    pack_path = sys.argv[1]
    patch_dir = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else PATCH_DIR
    pack = json.load(open(pack_path, encoding="utf-8"))
    fixed, no_file, no_match = 0, [], []
    for s in pack["sources"]:
        if s.get("status") == "ok":
            continue
        text, how = patch_text(s["id"], patch_dir)
        if not text or len(text) < 200:
            no_file.append(s["id"])
            continue
        s["status"] = "ok"
        s["provenance"] = how
        s["textLen"] = len(text)
        s["failReason"] = ""
        claim = next((a.get("claim", "") for a in s.get("anchors", [])), "")
        loc = locate(claim, text) if claim else None
        if loc:
            s["anchors"] = [{"claim": claim, **loc}]
            fixed += 1
        else:
            s["anchors"] = [{"claim": claim, "matched": False, "hit": "",
                             "before": [], "after": [],
                             "note": "原文已补录，但未定位到对应句（可能为转述/概括）"}]
            no_match.append(s["id"])
        print(f"OK  {s['id']:<5} {s['name'][:20]:<22} {'命中' if loc else '未命中'} | {how}")
    json.dump(pack, open(pack_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\n补录完成：命中 {fixed}，未命中 {len(no_match)}（{', '.join(no_match) or '无'}），缺文件 {len(no_file)}（{', '.join(no_file) or '无'}）")
    print(f"已写回：{pack_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main()
