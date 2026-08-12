#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""见微·溯源补抓：通过 Kimi WebBridge 驱动用户真实浏览器，抓取反爬来源的正文。

用法：
    python3 tools/trace/fetch_webbridge.py html S3=https://... S5=https://...
    python3 tools/trace/fetch_webbridge.py pdf  S7=https://....pdf ...

产物写入工作区 trace-patch/：HTML → <id>.txt；PDF → <id>.pdf。
浏览器标签归入「见微·溯源补抓」标签组，由用户决定是否关闭。
"""
import base64
import json
import os
import sys
import time
import urllib.request

DAEMON = "http://127.0.0.1:10086/command"
SESSION = "trace-source-fetch"
GROUP = "见微·溯源补抓"
PATCH_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "trace-patch")
EXTRACT_JS = ("""(()=>{const sels=['article','main','.article-content','.entry-content',"""
              """'#article','.post-content','.article-body','.story-body','.content'];"""
              """let el=null;for(const s of sels){const c=document.querySelector(s);"""
              """if(c&&c.innerText.length>500){el=c;break}}el=el||document.body;"""
              """return JSON.stringify({title:document.title,text:el.innerText.slice(0,120000)})})()""")

_first_nav = True


def cmd(action, args, timeout=90):
    body = json.dumps({"action": action, "args": args, "session": SESSION}).encode("utf-8")
    req = urllib.request.Request(DAEMON, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        res = json.loads(r.read().decode("utf-8"))
    if isinstance(res, dict) and isinstance(res.get("data"), dict):
        return res["data"]
    return res


def navigate(url, new_tab=False):
    """默认复用当前标签顺序爬取（navigate 才是唯一可靠的 current-tab 切换方式）；
    new_tab=True 用于 PDF 抓取时开一个干净同源页面（避免标签落在 PDF viewer 上失联）。"""
    global _first_nav
    args = {"url": url}
    if new_tab:
        args["newTab"] = True
    if _first_nav:
        args["group_title"] = GROUP
        _first_nav = False
    res = cmd("navigate", args)
    if not res.get("success"):
        raise RuntimeError(f"navigate 失败: {res}")
    return res


def fetch_html(sid, url):
    navigate(url)
    time.sleep(5)
    iframe_done = False
    for _ in range(3):  # 等待正文加载（部分站点有反爬挑战页）
        res = cmd("evaluate", {"code": EXTRACT_JS})
        val = res.get("value")
        if val:
            try:
                data = json.loads(val)
                if len(data.get("text", "")) >= 400:
                    break
            except Exception:
                pass
        if not iframe_done:  # 正文为空且页面套了跨域 iframe：直接导航到 iframe 地址再取
            iframe_done = True
            try:
                fr = cmd("evaluate", {"code": "(()=>{const f=document.querySelector('iframe[src]');return f?f.src:''})()"})
                src = (fr.get("value") or "").strip()
                if src.startswith("http"):
                    navigate(src)
                    time.sleep(5)
                    continue
            except Exception:
                pass
        time.sleep(4)
    else:
        return False, "正文提取为空（可能是挑战页/需登录）"
    path = os.path.join(PATCH_DIR, f"{sid}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(data["text"])
    return True, f"{len(data['text'])} chars | {data.get('title','')[:40]}"


def fetch_pdf(sid, url):
    """先尝试 CDP 直接下载；失败则导航到同源 HTML 页面后在页面上下文 fetch 分块取回。"""
    import urllib.parse
    out = os.path.join(PATCH_DIR, "downloads")
    os.makedirs(out, exist_ok=True)
    # 同源/近源 HTML 页面上下文 fetch → blob → a[download] 触发真实浏览器下载，从 ~/Downloads 回收。
    # 注意：绝不能把标签导航到 PDF URL——会落在 chrome-extension 查看器上彻底失联；
    # 也不走 base64 分块——大响应会被守护进程截断导致 PDF 损坏。
    ORIGIN_PAGE = {"web-assets.bcg.com": "https://www.bcg.com/"}
    downloads = os.path.expanduser("~/Downloads")
    before = set(os.listdir(downloads))
    try:
        p = urllib.parse.urlparse(url)
        page = ORIGIN_PAGE.get(p.netloc, f"{p.scheme}://{p.netloc}/")
        navigate(page, new_tab=True)
        time.sleep(4)
        init = cmd("evaluate", {"code":
                                f"(async()=>{{const r=await fetch({json.dumps(url)});"
                                "if(!r.ok)throw new Error('HTTP '+r.status);"
                                "const b=await r.blob();"
                                "const a=document.createElement('a');"
                                "a.href=URL.createObjectURL(b);a.download='trace-patch.pdf';"
                                "document.body.appendChild(a);a.click();a.remove();"
                                "return b.size})()"},
                   timeout=180)
        size = init.get("value")
        if not size or int(size) < 10000:
            return False, f"fetch 字节数异常: {size or init}"
        for _ in range(30):
            time.sleep(2)
            new = [f for f in set(os.listdir(downloads)) - before
                   if f.lower().endswith(".pdf") and not f.endswith(".crdownload")]
            new = [f for f in new if os.path.getsize(os.path.join(downloads, f)) > 10000]
            if new:
                src = os.path.join(downloads, max(new, key=lambda f: os.path.getmtime(os.path.join(downloads, f))))
                dst = os.path.join(PATCH_DIR, f"{sid}.pdf")
                os.replace(src, dst)
                return True, f"{os.path.getsize(dst)//1024} KB (browser-dl)"
        return False, "下载未出现在 ~/Downloads"
    except Exception as e:
        return False, str(e)[:120]


def main():
    mode = sys.argv[1]
    pairs = [a.split("=", 1) for a in sys.argv[2:] if "=" in a]
    os.makedirs(PATCH_DIR, exist_ok=True)
    fn = fetch_html if mode == "html" else fetch_pdf
    ok = 0
    for sid, url in pairs:
        try:
            good, msg = fn(sid, url)
        except Exception as e:
            good, msg = False, str(e)[:120]
        ok += good
        print(f"{'OK ' if good else 'FAIL'} {sid:<5} {msg}", flush=True)
    print(f"\n完成 {ok}/{len(pairs)} -> {os.path.abspath(PATCH_DIR)}")


if __name__ == "__main__":
    main()
