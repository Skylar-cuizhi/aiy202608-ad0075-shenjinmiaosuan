#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""见微·报告溯源：从报告 markdown 生成溯源数据（sources.json 等，对齐前端 TracePack 格式）。

用法: python3 tools/trace/build_data.py <report.md> [pack_slug]

- 引证格式：内联 [(名称)](URL)，或脚注 [^N^]（文尾 `[^N^]: 描述 <URL>` 定义，自动归一化为内联）。
- 抓取来源原文（HTML / PDF），把每条引证定位到原文句子（命中句 + 前后句）。
- 输出 out/trace_data/<slug>/: report.md, report.normalized.md, claims.json, sources.json
- 再用 emit_pack.py 把 report + sources.json 合成可导入见微的溯源包。
"""
import io
import json
import re
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("需要 requests: 见微内建 Python 已自带; 若用系统 python 请 pip3 install --user requests")

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "out" / "trace_data"

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"}

# ---------- 引证解析 ----------

CITE_RE = re.compile(r"\[\(([^)\n]{1,60})\)\]\((https?://[^)\s]+)\)")
FOOT_DEF_RE = re.compile(r"^\[\^(\d+)\^\]:\s*(.*?)\s*(?:<(https?://[^>\s]+)>|(https?://\S+))?\s*$", re.M)
# ChatGPT 深度研究导出残留：PUA 私有区字符（U+E200/U+E202/U+E201 等）包裹的 cite…turn…search… 令牌
GPT_CITE_PUA_RE = re.compile("[\uE000-\uF8FF]")
GPT_CITE_TOKEN_RE = re.compile(r"cite(?:turn\d+(?:search|academia)\d+)+")


def strip_gpt_cite_tokens(md: str) -> str:
    """清除 ChatGPT 导出的引证令牌；不去除会导致脚注定义行尾残留令牌、定义正则整行失配、全文 0 来源。"""
    return GPT_CITE_TOKEN_RE.sub("", GPT_CITE_PUA_RE.sub("", md))


def _foot_name(desc: str) -> str:
    """从脚注描述取来源名：去《》后按第一个标点截断。"""
    desc = re.sub(r"《[^》]*》", "", desc).strip()
    name = re.split(r"[，,：:／/]", desc)[0].strip()
    return name[:60]


def normalize_citations(md: str) -> str:
    """把脚注式引证 [^N^]（文尾定义）转成内联 [(名称)](URL)；无 URL 的定义行直接删除。已是内联格式则原样返回。"""
    md = strip_gpt_cite_tokens(md)
    defs = {}
    for m in FOOT_DEF_RE.finditer(md):
        num, desc, u1, u2 = m.groups()
        url = u1 or u2
        if url:
            defs[num] = (_foot_name(desc) or f"来源{num}", url.rstrip(")。，"))
    if not defs:
        return md
    body = FOOT_DEF_RE.sub("", md)
    body = re.sub(r"\n{3,}", "\n\n", body)

    def repl(m):
        d = defs.get(m.group(1))
        return f"[({d[0]})]({d[1]})" if d else ""

    return re.sub(r"\[\^(\d+)\^\]", repl, body)


def extract_claims(md: str):
    """抽取正文中的 [(名称)](URL) 引证，返回 [{url, name, claim}]；claim 为该句上下文（供原文定位）。"""
    claims, seen = [], set()
    for line in md.splitlines():
        s = line.strip()
        if s.startswith(("![", "[(")) and (line.count("http") >= 2 or s.startswith("![")):
            continue  # 跳过图片与文末来源列表行
        for m in CITE_RE.finditer(line):
            name, url = m.group(1).strip(), m.group(2).strip()
            ctx = (line[: m.start()] + line[m.end():]).strip()
            ctx = re.sub(r"^[#>*\-\s\d.、]+", "", ctx)
            ctx = re.sub(r"\*\*", "", ctx)
            ctx = ctx[:280]
            if url in seen:
                for c in claims:  # 同 URL 再出现：补充一条定位上下文
                    if c["url"] == url and ctx and ctx not in c["claim"]:
                        c["claim"] = (c["claim"] + " ｜ " + ctx)[:400]
                        break
                continue
            seen.add(url)
            claims.append({"url": url, "name": name, "claim": ctx})
    return claims


# ---------- 域名分级（A 一手权威 / B 专业署名报道 / C 二手转述 / D 不可追责） ----------

def domain_of(url: str) -> str:
    m = re.match(r"https?://(?:www\.)?([^/]+)", url)
    return (m.group(1) if m else url).lower()


def grade_of(url: str):
    d = domain_of(url)
    if re.search(r"(mckinsey|deloitte|pwc|idc\.|counterpoint|gartner|statista|canalys|questmobile|runto|wellsenn|frost|bain\.|bcg|cinnogroup|strategyanalytics|iresearch|analysys)", d):
        return "A", "专业机构原始研究报告（一手数据发布方）"
    if re.search(r"(gov\.cn|ftc\.gov|fcc\.gov|sec\.gov|europa\.eu|commerce\.gov|congress\.gov|govinfo|courtlistener|justia|pirg\.org|who\.int|un\.org)", d):
        return "A", "政府 / 监管 / 司法官方来源"
    if re.search(r"(blog\.google|apple\.com|meta\.com|about\.fb\.com|mi\.com|xiaomi|huawei\.com|oppo\.com|vivo\.com|baidu\.com/news|alibaba|tencent\.com|bytedance|rokid|xreal|ray-ban|essilorluxottica)", d):
        return "A", "厂商官方披露（新闻稿 / 官方博客 / 财报）"
    if re.search(r"(bloomberg|reuters|ft\.com|wsj|nytimes|theverge|techcrunch|cnbc|apnews|washingtonpost|bbc|cnn|wired|scmp|koreatimes|36kr|tmtpost|jiqizhixin|iyiou|sina\.com|sohu\.com|163\.com|qq\.com|ifeng|thepaper|guancha|huxiu|geekpark|leiphone|qbitai|ebrun|caixin|yicai|jingji|stcn|cls\.cn)", d):
        return "B", "主流媒体 / 专业媒体署名报道"
    if re.search(r"(zhihu|baike|wikipedia|weixin|mp\.|medium|substack|toutiao|douban|xiaohongshu|reddit)", d):
        return "C", "百科 / 自媒体 / 社区二手转述"
    if re.search(r"(tieba|4chan|anonymous)", d):
        return "D", "匿名来源，不可追责"
    return "C", "未识别域名，按二手转述保守分级"


# ---------- 抓取与正文提取（HTML + PDF） ----------

def fetch(url: str, timeout=20):
    """返回 (raw_bytes, None) 或 (None, err)。"""
    try:
        r = requests.get(url, headers=UA, timeout=timeout, allow_redirects=True)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}"
        raw = r.content
        if len(raw) < 200:
            return None, f"响应过小（{len(raw)}B，可能需登录/反爬）"
        return raw, None
    except Exception as e:
        return None, str(e)[:150]


def extract_text(raw: bytes):
    """从 HTML 或 PDF 二进制提取正文，返回 {title, date, text}。"""
    if raw[:5] == b"%PDF-":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        meta = reader.metadata or {}
        text = "\n".join((p.extract_text() or "") for p in reader.pages[:80])
        return {"title": (meta.title or "").strip(), "date": "",
                "text": re.sub(r"\s{3,}", "  ", text)}
    soup = BeautifulSoup(raw, "html.parser")
    for t in soup(["script", "style", "noscript", "header", "footer", "nav", "form", "aside"]):
        t.decompose()
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    date = ""
    meta = soup.find("meta", attrs={"property": "article:published_time"}) or soup.find("meta", attrs={"name": re.compile(r"date|publish", re.I)})
    if meta and meta.get("content"):
        date = meta["content"][:10]
    main = soup.find("article") or soup.find("main") or soup.body or soup
    text = re.sub(r"\n{3,}", "\n\n", main.get_text("\n", strip=True))
    return {"title": title, "date": date, "text": text}


# ---------- 定位与高亮 ----------

def _bigrams(s: str):
    s = re.sub(r"[^\w一-鿿]+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def locate(claim_ctx: str, source_text: str):
    """把报告引证句定位到原文句子。命中返回 {matched, hit, before, after, note}，未命中返回 None。"""
    sents = [s.strip() for s in re.split(r"(?<=[。！？!?；;])|\n", source_text) if len(s.strip()) >= 6]
    cands = [c.strip() for c in re.split(r"[。；;!?！？\n｜]", claim_ctx) if len(c.strip()) >= 8]
    cands.sort(key=len, reverse=True)
    best_i, best_sc = -1, 0.0
    for c in cands[:8]:
        cw = _bigrams(c)
        if not cw:
            continue
        for i, s in enumerate(sents[:4000]):
            sc = len(cw & _bigrams(s)) / len(cw)
            if sc > best_sc:
                best_i, best_sc = i, sc
        if best_sc >= 0.5:
            break
    if best_i < 0 or best_sc < 0.30:
        return None
    return {
        "matched": True,
        "hit": sents[best_i][:400],
        "before": [s for s in sents[max(0, best_i - 2):best_i]][:2],
        "after": [s for s in sents[best_i + 1:best_i + 3]][:2],
        "note": f"二元组重合度 {best_sc:.0%}",
    }


# ---------- 主流程 ----------

def build_sources(claims, sleep=0.3, verbose=True):
    """逐来源抓取 + 定位，返回前端 TraceSource 格式的列表。"""
    sources = []
    for i, c in enumerate(claims, 1):
        grade, reason = grade_of(c["url"])
        src = {"id": f"S{i}", "name": c["name"], "url": c["url"],
               "grade": grade, "gradeReason": reason,
               "status": "fail", "failReason": "", "title": "", "date": "", "textLen": 0,
               "anchors": []}
        raw, err = fetch(c["url"])
        if err:
            src["failReason"] = err
            src["grade"] = "U" if "HTTP 4" in err or "HTTP 5" in err else grade
            src["anchors"].append({"claim": c["claim"], "matched": False, "hit": "",
                                   "before": [], "after": [],
                                   "note": f"原文未能获取（{err}）"})
        else:
            try:
                info = extract_text(raw)
            except Exception as e:
                info, err = None, f"正文提取失败：{str(e)[:100]}"
            if not info or len(info["text"]) < 100:
                src["failReason"] = err or "正文提取过短（可能需登录/反爬）"
                src["anchors"].append({"claim": c["claim"], "matched": False, "hit": "",
                                       "before": [], "after": [],
                                       "note": f"原文未能获取（{src['failReason']}）"})
            else:
                src.update({"status": "ok", "title": info["title"][:120],
                            "date": info["date"], "textLen": len(info["text"])})
                loc = locate(c["claim"], info["text"])
                if loc:
                    src["anchors"].append({"claim": c["claim"], **loc})
                else:
                    src["anchors"].append({"claim": c["claim"], "matched": False, "hit": "",
                                           "before": [], "after": [],
                                           "note": "原文已获取，但未定位到对应句（可能为转述/概括）"})
        sources.append(src)
        if verbose:
            print(f"[{i}/{len(claims)}] {src['status']:<4} {src['grade']}  {c['name'][:22]:<24} {c['url'][:70]}", flush=True)
        time.sleep(sleep)
    return sources


def main():
    md_path = Path(sys.argv[1])
    slug = sys.argv[2] if len(sys.argv) > 2 else md_path.stem
    out = OUT / slug
    out.mkdir(parents=True, exist_ok=True)
    md = md_path.read_text(encoding="utf-8")
    md_norm = normalize_citations(md)
    claims = extract_claims(md_norm)
    (out / "report.md").write_text(md, encoding="utf-8")
    (out / "report.normalized.md").write_text(md_norm, encoding="utf-8")
    (out / "claims.json").write_text(json.dumps(claims, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"claims: {len(claims)}")
    sources = build_sources(claims)
    (out / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for s in sources if s["status"] == "ok")
    matched = sum(1 for s in sources for a in s["anchors"] if a.get("matched"))
    print(f"\nDone. fetched {ok}/{len(sources)}, matched {matched}. -> {out}")


if __name__ == "__main__":
    main()
