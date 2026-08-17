#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""见微 · 调研溯源 本地管线服务（仅监听本机回环 127.0.0.1:8787，不对外暴露）

启动：
    python3 tools/trace/server.py

接口：
    GET  /health   → {"ok": true, "webbridge": bool}（webbridge=浏览器补抓是否可用）
    POST /build    body: {"title": "...", "reportMd": "..."}（UTF-8 JSON）
                  → 抓取全部引证来源、定位锚点、可信度分级，返回完整溯源包 JSON
                  同时落盘 trace-out/last-pack.json 备份
    POST /refetch  body: {"url": "...", "name": "...", "claims": ["..."]}
                  → 单来源补抓：先直连重试，失败则自动经 Kimi WebBridge 驱动本机真实浏览器抓取，
                    重新定位锚点与分级，返回该来源的完整 TraceSource JSON（不含 id，由前端保留）

见微前端「粘贴报告」与失败来源「补抓」功能调用本服务；关闭服务后前端自动降级为「仅粘贴浏览 / 剪贴板手动补录」。
"""
import json, os, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import extract_claims, normalize_citations, fetch, extract_text, locate, grade_of, domain_of  # noqa: E402

import warnings; warnings.filterwarnings("ignore")  # noqa: E402
try:
    import urllib3; urllib3.disable_warnings()
except Exception:
    pass

HOST, PORT = "127.0.0.1", 8787
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trace-out")


def build_pack(title: str, report_md: str) -> dict:
    report_md = normalize_citations(report_md)  # 脚注式 [^N^] 引证先归一化为内联 [(名称)](URL)
    claims = extract_claims(report_md)
    urls = {}
    for c in claims:
        urls.setdefault(c["url"], c["name"])
    print(f"[build] 引证 {len(claims)} 处，唯一来源 {len(urls)} 个", flush=True)

    pages = {}
    def job(u):
        html, err = fetch(u)
        if err:
            return u, None, err
        info = extract_text(html)
        if len(info["text"]) < 100:
            return u, None, "正文提取过短（可能需登录/反爬）"
        return u, info, None
    with ThreadPoolExecutor(8) as ex:
        futs = {ex.submit(job, u): u for u in urls}
        done = 0
        for f in as_completed(futs):
            u, info, err = f.result()
            done += 1
            pages[u] = (info, err)
            print(f"[build] [{done:02d}/{len(urls)}] {'OK ' if info else 'FAIL'} {domain_of(u)}", flush=True)

    sources = []
    for i, (url, name) in enumerate(urls.items()):
        g, reason = grade_of(url)
        info, err = pages.get(url, (None, "未抓取"))
        src = {
            "id": f"S{i+1}", "name": name, "url": url,
            "grade": g, "gradeReason": reason,
            "status": "ok" if info else "fail",
            "failReason": "" if info else err,
            "title": info["title"] if info else "",
            "date": info["date"] if info else "",
            "textLen": len(info["text"]) if info else 0,
            "anchors": [],
        }
        if info:
            for c in claims:
                if c["url"] != url:
                    continue
                loc = locate(c["claim"], info["text"])
                if loc:
                    src["anchors"].append({"claim": c["claim"], **loc})
        else:
            for c in claims:
                if c["url"] == url:
                    src["anchors"].append({"claim": c["claim"], "matched": False, "hit": "",
                                           "before": [], "after": [],
                                           "note": f"原文未能获取（{src['failReason']}）"})
        sources.append(src)

    if not title:
        import re
        m = re.search(r"^#\s+(.+)$", report_md, re.M)
        title = m.group(1).strip() if m else "粘贴的调研报告"
    return {"title": title, "reportMd": report_md, "sources": sources}


def webbridge_available() -> bool:
    """Kimi WebBridge 守护与浏览器扩展是否在线（在线才能浏览器补抓）。"""
    try:
        import urllib.request as ur
        with ur.urlopen("http://127.0.0.1:10086/status", timeout=2) as r:
            st = json.loads(r.read().decode("utf-8"))
        return bool(st.get("extension_connected"))
    except Exception:
        return False


def browser_fetch_text(url: str):
    """经 WebBridge 驱动用户真实浏览器抓取正文；返回 (text, title, err)。标签归入「见微·溯源补抓」组。"""
    try:
        import fetch_webbridge as wb
    except Exception as e:
        return None, None, f"补抓模块不可用：{e}"
    try:
        wb.navigate(url, new_tab=True)
        time.sleep(5)
        for _ in range(3):  # 等正文加载（部分站点有反爬挑战页）
            res = wb.cmd("evaluate", {"code": wb.EXTRACT_JS})
            val = res.get("value")
            if val:
                try:
                    data = json.loads(val)
                    if len(data.get("text", "")) >= 400:
                        return data["text"], data.get("title", ""), None
                except Exception:
                    pass
            time.sleep(4)
        return None, None, "正文提取为空（可能是挑战页/需登录）"
    except Exception as e:
        return None, None, str(e)[:120]


def refetch_source(url: str, name: str, claims: list) -> dict:
    """单来源补抓：先直连重试，失败则自动经 WebBridge 浏览器抓取；重新定位锚点与分级。"""
    info, err, how = None, "", ""
    raw, ferr = fetch(url)
    if not ferr:
        i2 = extract_text(raw)
        if len(i2["text"]) >= 100:
            info = i2
        else:
            ferr = "正文提取过短（可能需登录/反爬）"
    if info is None:
        text, title, werr = browser_fetch_text(url)
        if text:
            info = {"title": title or "", "date": "", "text": text}
            how = "WebBridge 浏览器补抓（见微内建）"
        else:
            err = f"直连重试失败（{ferr}）；浏览器补抓失败（{werr}）"

    grade, reason = grade_of(url)
    src = {"name": name or domain_of(url), "url": url,
           "grade": grade, "gradeReason": reason,
           "status": "ok" if info else "fail",
           "failReason": "" if info else err,
           "title": (info["title"] if info else "")[:120],
           "date": info["date"] if info else "",
           "textLen": len(info["text"]) if info else 0,
           "anchors": []}
    if how:
        src["provenance"] = how
    for claim in claims or []:
        if info:
            loc = locate(claim, info["text"])
            src["anchors"].append({"claim": claim, **loc} if loc else
                                  {"claim": claim, "matched": False, "hit": "", "before": [], "after": [],
                                   "note": "原文已获取，但未定位到对应句（可能为转述/概括）"})
        else:
            src["anchors"].append({"claim": claim, "matched": False, "hit": "", "before": [], "after": [],
                                   "note": f"原文未能获取（{src['failReason']}）"})
    return src


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "jianwei-trace-pipeline", "webbridge": webbridge_available()})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/refetch":
            try:
                n = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(n).decode("utf-8"))
                url = payload.get("url", "").strip()
                if not url.startswith("http"):
                    raise ValueError("url 缺失或不合法")
                t0 = time.time()
                src = refetch_source(url, payload.get("name", ""), payload.get("claims") or [])
                print(f"[refetch] {src['status']:<4} {domain_of(url)} 耗时 {time.time()-t0:.0f}s", flush=True)
                self._json(200, src)
            except Exception as e:
                self._json(400, {"error": str(e)[:200]})
            return
        if self.path != "/build":
            self._json(404, {"error": "not found"})
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            report_md = payload.get("reportMd", "")
            if len(report_md) < 50:
                raise ValueError("reportMd 太短")
            t0 = time.time()
            pack = build_pack(payload.get("title", ""), report_md)
            ok = sum(1 for s in pack["sources"] if s["status"] == "ok")
            matched = sum(1 for s in pack["sources"] for a in s["anchors"] if a.get("matched"))
            print(f"[build] 完成：{len(pack['sources'])} 来源（可获取 {ok}），锚点 {matched}，耗时 {time.time()-t0:.0f}s", flush=True)
            os.makedirs(OUT_DIR, exist_ok=True)
            with open(os.path.join(OUT_DIR, "last-pack.json"), "w", encoding="utf-8") as f:
                json.dump(pack, f, ensure_ascii=False)
            self._json(200, pack)
        except Exception as e:
            self._json(400, {"error": str(e)[:200]})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    print(f"见微 · 调研溯源管线服务已启动：http://{HOST}:{PORT}（仅本机回环，Ctrl+C 停止）")
    HTTPServer((HOST, PORT), Handler).serve_forever()
