#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""调研报告溯源数据管线（见微 · 调研溯源模块配套工具）：
解析报告中的 [(来源)](URL) 引证 → 抓取原文 → 定位每条主张在原文中的锚点句 → 来源可信度分级 → sources.json

用法：
    python3 tools/trace/build_data.py <调研报告.md> [输出目录]
随后用 emit_pack.py 把报告与 sources.json 合成可导入见微的溯源包 JSON。
依赖：requests（可选）、beautifulsoup4；PDF 来源的补抓需 pypdf。
"""
import json, re, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

REPORT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else "report.md"
OUT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else "trace-out"
os.makedirs(OUT, exist_ok=True)

try:
    import requests
    HAS_REQ = True
except ImportError:
    HAS_REQ = False
    import urllib.request

from bs4 import BeautifulSoup

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"}

CITE_RE = re.compile(r"\[\(([^\)]{1,40})\)\]\((https?://[^\)]+)\)")
NUM_RE = re.compile(r"\d+(?:\.\d+)?")
SENT_SPLIT = re.compile(r"(?<=[。！？；!?])")
STOP = set("的了是在和有和与等中为对年月日其该各将已并被及或也都而就这那你我他她它们个之於于以让从向到把被给但而且如果因所以根据其中以上以下以及")

# ---------------- 可信度分级（对齐 traceable-research 的 rubric） ----------------
GRADE_MAP = {
    "idc.com": ("A", "机构官网原始数据页"),
    "businesswire.com": ("A", "Omdia 通稿官方发布页"),
    "news.cn": ("A", "国家级通讯社原文"),
    "gov.cn": ("A", "政府原文"),
    "dfcfw.com": ("B", "券商研报原文 PDF（卖方立场）"),
    "people.com.cn": ("B", "主流媒体署名报道（转述 IDC 数据）"),
    "thepaper.cn": ("B", "主流媒体署名报道"),
    "caixin.com": ("B", "主流财经媒体署名报道"),
    "36kr.com": ("B", "主流科技媒体署名报道"),
    "ifanr.com": ("B", "主流科技媒体署名报道"),
    "cnet.com": ("B", "国际主流科技媒体（转述 Counterpoint）"),
    "vrtuoluo.cn": ("B", "XR 行业头部垂直媒体原创"),
    "nweon.com": ("B", "XR 行业垂直媒体原创"),
    "tmtpost.com": ("B", "科技媒体署名报道"),
    "huxiu.com": ("B", "科技媒体署名报道"),
    "lanjinger.com": ("B", "财经媒体署名报道"),
    "ledinside.cn": ("B", "行业研究机构媒体"),
    "93913.com": ("C", "VR 行业自媒体"),
    "ofweek.com": ("C", "行业门户（多为供稿/转载）"),
    "ofweek.com.cn": ("C", "行业门户（多为供稿/转载）"),
    "sohu.com": ("C", "门户自媒体号转载"),
    "163.com": ("C", "门户自媒体号转载"),
    "sina.cn": ("C", "门户转载"),
    "sina.com.cn": ("C", "门户转载"),
    "smzdm.com": ("C", "消费社区内容（政策转述）"),
    "xueqiu.com": ("C", "投资社区帖子（转述券商观点）"),
    "199it.com": ("C", "数据聚合摘要站"),
    "fxbaogao.com": ("C", "报告聚合站"),
    "cloud.tencent.com": ("C", "云厂商开发者社区转载"),
    "lmtw.com": ("C", "行业站点（转载洛图数据）"),
    "chaoyidianzi.com": ("C", "电子行业小站转载"),
    "10100.com": ("D", "陌生聚合站，责任主体不明"),
    "techx.pk": ("D", "境外小站，无法确认原始出处"),
    "43y.com.cn": ("D", "陌生站点，无法确认原始出处"),
    "kompozy.io": ("D", "境外小站，责任主体不明"),
    "a11.world": ("D", "陌生金融站点，责任主体不明"),
    "abvr360.com": ("D", "VR 小站，责任主体不明"),
    "glassalmanac.com": ("D", "境外眼镜资讯小站，责任主体不明"),
    "treeview.studio": ("D", "境外工作室博客聚合"),
    "weeklyonstock.com": ("D", "陌生站点托管 PDF，出处不明"),
    "ithome.com": ("B", "主流科技媒体署名报道"),
}

def domain_of(url):
    m = re.search(r"https?://(?:www\.|m\.|mp\.|c\.|news\.|post\.|static\.|pdf\.|fin\.|cloud\.)?([^/]+)", url)
    host = url.split("/")[2].lower()
    for d in sorted(GRADE_MAP, key=len, reverse=True):
        if host.endswith(d):
            return d
    return host

def grade_of(url):
    d = domain_of(url)
    return GRADE_MAP.get(d, ("D", "陌生域名，责任主体不明"))

# ---------------- 报告解析 ----------------
def extract_claims(md):
    """返回 [(name, url, claim)]，claim 为引证所在的中文句子（截断到 ≤240 字）"""
    claims = []
    lines = md.split("\n")
    for ln, line in enumerate(lines):
        for m in CITE_RE.finditer(line):
            name, url = m.group(1).strip(), m.group(2).strip()
            # 跳过文末来源列表区（形如 " [(x)](url) : url" 独占一行）
            if line.strip().startswith("[(") and line.count("http") >= 2:
                continue
            # 定位所在句子：向前后扩展到句界
            start = m.start()
            left = max(line.rfind(b, 0, start) for b in "。！？\n") + 1
            right_cands = [line.find(b, m.end()) for b in "。！？\n"]
            right_cands = [r for r in right_cands if r != -1]
            right = min(right_cands) + 1 if right_cands else len(line)
            claim = line[left:right].strip()
            claim = CITE_RE.sub(lambda mm: f"（{mm.group(1)}）", claim)  # 引证替换为可读文本
            claim = re.sub(r"!\[[^\]]*\]\([^\)]*\)", "", claim)
            claim = re.sub(r"\*\*", "", claim)
            if len(claim) > 240:
                # 超长句：围绕引证截取窗口
                cpos = claim.find(f"（{name}）")
                if cpos == -1: cpos = len(claim)//2
                s = max(0, cpos-110); e = min(len(claim), cpos+130)
                claim = ("…" if s>0 else "") + claim[s:e] + ("…" if e<len(claim) else "")
            if len(claim) < 8:
                continue
            claims.append({"name": name, "url": url, "claim": claim, "line": ln})
    return claims

# ---------------- 抓取与正文提取 ----------------
def fetch(url):
    try:
        if HAS_REQ:
            r = requests.get(url, headers=UA, timeout=15, verify=False)
            r.encoding = r.apparent_encoding or r.encoding
            if r.status_code != 200:
                return None, f"HTTP {r.status_code}"
            return r.text, None
        else:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
            return raw.decode("utf-8", "ignore"), None
    except Exception as e:
        return None, str(e)[:80]

def extract_text(html):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "iframe", "nav", "footer", "aside", "form"]):
        t.decompose()
    title = (soup.title.string.strip() if soup.title and soup.title.string else "")
    # 发布日期
    date = ""
    for meta in soup.find_all("meta"):
        k = (meta.get("property") or meta.get("name") or "").lower()
        if any(x in k for x in ["publish", "date", "pubdate"]):
            v = meta.get("content") or ""
            dm = re.search(r"\d{4}[-/年]\d{1,2}[-/月]\d{1,2}", v)
            if dm: date = dm.group(0); break
    # 正文候选
    best, best_len = None, 0
    cands = soup.find_all("article") or soup.find_all(["div", "section", "main"])
    for el in cands:
        ps = [p.get_text(" ", strip=True) for p in el.find_all(["p", "h2", "h3", "li"])]
        ps = [p for p in ps if len(p) >= 12]
        total = sum(len(p) for p in ps)
        if total > best_len:
            best, best_len = ps, total
    if not best:
        ps = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
        best = [p for p in ps if len(p) >= 12]
    text = "\n".join(best)
    if not date:
        dm = re.search(r"\d{4}[-/年]\d{1,2}[-/月]\d{1,2}", text[:1500] + html[:3000])
        if dm: date = dm.group(0)
    return {"title": title[:80], "date": date, "text": text}

# ---------------- 锚点定位 ----------------
def bigrams(s):
    s = re.sub(r"[^\u4e00-\u9fffA-Za-z]", "", s)
    return {s[i:i+2] for i in range(len(s)-1) if not (s[i] in STOP or s[i+1] in STOP)}

def locate(claim, text):
    if not text:
        return None
    sents = []
    for para in text.split("\n"):
        for s in SENT_SPLIT.split(para):
            s = s.strip()
            if s: sents.append(s)
    if not sents:
        return None
    c_nums = [n for n in NUM_RE.findall(claim) if len(n) >= 2 and n not in ("2026", "2025", "2024")]
    c_bg = bigrams(claim)
    best_i, best_score = -1, 0
    for i, s in enumerate(sents):
        s_nums = set(NUM_RE.findall(s))
        shared = [n for n in c_nums if n in s_nums]
        bg_overlap = len(c_bg & bigrams(s))
        score = sum(3 + min(len(n), 6) for n in shared) + min(bg_overlap, 12)
        if score > best_score:
            best_i, best_score = i, score
    # 阈值：至少 1 个共享数字，或 >=6 个共享二元组
    s_hit = sents[best_i] if best_i >= 0 else ""
    has_num = any(n in NUM_RE.findall(s_hit) for n in c_nums) if s_hit else False
    if best_i < 0 or (not has_num and len(c_bg & bigrams(s_hit)) < 6):
        return {"matched": False, "hit": "", "before": sents[:2], "after": [], "note": "已获取原文，但未定位到精确对应句，需人工核对"}
    return {"matched": True,
            "hit": sents[best_i],
            "before": sents[max(0, best_i-2):best_i],
            "after": sents[best_i+1:best_i+3],
            "note": ""}

# ---------------- 主流程 ----------------
def main():
    md = open(REPORT, encoding="utf-8").read()
    claims = extract_claims(md)
    urls = {}
    for c in claims:
        urls.setdefault(c["url"], c["name"])
    print(f"引证 {len(claims)} 处，唯一来源 {len(urls)} 个", flush=True)

    pages = {}
    def job(u):
        html, err = fetch(u)
        if err: return u, None, err
        info = extract_text(html)
        if len(info["text"]) < 100: return u, None, "正文提取过短（可能需登录/反爬）"
        return u, info, None
    with ThreadPoolExecutor(8) as ex:
        futs = {ex.submit(job, u): u for u in urls}
        done = 0
        for f in as_completed(futs):
            u, info, err = f.result()
            done += 1
            pages[u] = (info, err)
            tag = "OK " if info else "FAIL"
            print(f"[{done:02d}/{len(urls)}] {tag} {domain_of(u)} ({len(info['text']) if info else err})", flush=True)

    sources = {}
    for i, (url, name) in enumerate(urls.items()):
        g, reason = grade_of(url)
        info, err = pages.get(url, (None, "未抓取"))
        sources[url] = {
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
            open(os.path.join(OUT, f"src_{i+1}.txt"), "w", encoding="utf-8").write(info["text"])

    matched = 0
    for c in claims:
        src = sources[c["url"]]
        if src["status"] != "ok":
            src["anchors"].append({"claim": c["claim"], "matched": False, "hit": "", "before": [], "after": [],
                                   "note": f"原文未能获取（{src['failReason']}）"})
            continue
        info_text = open(os.path.join(OUT, f"src_{int(src['id'][1:])}.txt"), encoding="utf-8").read()
        loc = locate(c["claim"], info_text)
        if loc and loc["matched"]: matched += 1
        if loc and any(a.get("hit") == loc["hit"] and a.get("claim") == c["claim"] for a in src["anchors"]):
            continue
        if loc: src["anchors"].append({"claim": c["claim"], **loc})

    json.dump(list(sources.values()), open(os.path.join(OUT, "sources.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    ok = sum(1 for s in sources.values() if s["status"] == "ok")
    print(f"\n=== 完成 ===\n来源 {len(sources)}：成功获取 {ok} / 失败 {len(sources)-ok}")
    print(f"锚点定位：{matched}/{len(claims)} 处主张找到原文对应句")
    grades = {}
    for s in sources.values(): grades[s["grade"]] = grades.get(s["grade"], 0) + 1
    print("可信度分布:", grades)

if __name__ == "__main__":
    import warnings; warnings.filterwarnings("ignore")
    try:
        import urllib3; urllib3.disable_warnings()
    except Exception: pass
    main()
