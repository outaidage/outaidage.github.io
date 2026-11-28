// Toolbox.tsx — 在线工具箱（数字宇宙门户）。
// 5 个真实可用的小工具，全部在浏览器本地运行，不上传任何数据：
// JSON 格式化与验证、Base64 编解码、字数统计、JWT 解析、时间戳转换。
// 工具的名称/说明/排序/启用由后台「工具箱」管理（toolbox_tools 表），
// 通过 tools prop 传入；工具逻辑按 id 在代码里实现。
import { useEffect, useState } from "react";
import { DEFAULT_TOOLS, type ToolboxToolMeta } from "@/lib/toolbox-tools";

// ---- 复制反馈：小工具里任何复制动作都派发 outai:toast，ToastHost 统一提示 ----
function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("outai:toast", { detail: msg }));
}
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制到剪贴板");
  } catch {
    toast("复制失败，请手动选择复制");
  }
}
function ToastHost() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setMsg(String((e as CustomEvent).detail || ""));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMsg(""), 1800);
    };
    window.addEventListener("outai:toast", on);
    return () => {
      window.removeEventListener("outai:toast", on);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return msg ? <div className="tool-toast" role="status">{msg}</div> : null;
}

function ToolCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>{desc}</p>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a0d20",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e6edf3",
  padding: 10,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function JsonTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [msg, setMsg] = useState("");
  const format = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setMsg("JSON 有效，已格式化。");
    } catch (e) {
      setOutput("");
      setMsg(`JSON 无效：${(e as Error).message}`);
    }
  };
  const minify = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setMsg("已压缩为单行。");
    } catch (e) {
      setOutput("");
      setMsg(`JSON 无效：${(e as Error).message}`);
    }
  };
  return (
    <>
      <textarea style={{ ...inputStyle, minHeight: 120 }} placeholder='粘贴 JSON，例如 {"name":"OUTAI"}' value={input} onChange={(e) => setInput(e.target.value)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="button primary" onClick={format}>格式化</button>
        <button type="button" className="button secondary" onClick={minify}>压缩</button>
        {output ? <button type="button" className="button secondary" onClick={() => void copyText(output)}>复制结果</button> : null}
        <button type="button" className="button secondary" onClick={() => { setInput(""); setOutput(""); setMsg(""); }}>清空</button>
      </div>
      {msg ? <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>{msg}</p> : null}
      {output ? <pre style={{ ...inputStyle, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflow: "auto", margin: 0 }}>{output}</pre> : null}
    </>
  );
}

function Base64Tool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [msg, setMsg] = useState("");
  const encode = () => {
    try {
      setOutput(btoa(unescape(encodeURIComponent(input))));
      setMsg("已编码为 Base64。");
    } catch {
      setMsg("编码失败。");
    }
  };
  const decode = () => {
    try {
      setOutput(decodeURIComponent(escape(atob(input.trim()))));
      setMsg("已从 Base64 解码。");
    } catch {
      setOutput("");
      setMsg("解码失败：输入不是有效的 Base64。");
    }
  };
  return (
    <>
      <textarea style={{ ...inputStyle, minHeight: 100 }} placeholder="输入要编码的文本，或要解码的 Base64" value={input} onChange={(e) => setInput(e.target.value)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="button primary" onClick={encode}>编码</button>
        <button type="button" className="button secondary" onClick={decode}>解码</button>
        {output ? <button type="button" className="button secondary" onClick={() => void copyText(output)}>复制结果</button> : null}
        <button type="button" className="button secondary" onClick={() => { setInput(""); setOutput(""); setMsg(""); }}>清空</button>
      </div>
      {msg ? <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>{msg}</p> : null}
      {output ? <textarea style={{ ...inputStyle, minHeight: 80 }} readOnly value={output} onClick={(e) => (e.target as HTMLTextAreaElement).select()} /> : null}
    </>
  );
}

function WordCountTool() {
  const [input, setInput] = useState("");
  const chars = input.replace(/\s/g, "").length;
  const charsWithSpaces = input.length;
  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  const lines = input ? input.split("\n").length : 0;
  const paragraphs = input.trim() ? input.trim().split(/\n\s*\n/).length : 0;
  return (
    <>
      <textarea style={{ ...inputStyle, minHeight: 120 }} placeholder="粘贴或输入文本，实时统计字数…" value={input} onChange={(e) => setInput(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8 }}>
        {[
          ["字符（不含空格）", chars],
          ["字符（含空格）", charsWithSpaces],
          ["单词", words],
          ["行数", lines],
          ["段落", paragraphs],
        ].map(([label, value]) => (
          <div key={label as string} style={{ border: "1px solid #29313c", borderRadius: 8, padding: 10, textAlign: "center" }}>
            <div style={{ fontSize: 20, color: "#61edff" }}>{value}</div>
            <div style={{ fontSize: 11, color: "#929dab" }}>{label}</div>
          </div>
        ))}
      </div>
      <button type="button" className="button secondary" onClick={() => setInput("")}>清空</button>
    </>
  );
}

function decodeB64UrlJson(part: string): unknown {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function JwtTool() {
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");
  const [header, setHeader] = useState("");
  const [payload, setPayload] = useState("");
  const [claims, setClaims] = useState<[string, string][]>([]);
  const parse = () => {
    setHeader(""); setPayload(""); setClaims([]);
    const parts = input.trim().split(".");
    if (parts.length !== 3) {
      setMsg("解析失败：JWT 应为三段以 . 分隔的字符串。");
      return;
    }
    try {
      const h = decodeB64UrlJson(parts[0]) as Record<string, unknown>;
      const p = decodeB64UrlJson(parts[1]) as Record<string, unknown>;
      setHeader(JSON.stringify(h, null, 2));
      setPayload(JSON.stringify(p, null, 2));
      const rows: [string, string][] = [];
      const fmt = (v: unknown) => new Date(Number(v) * 1000).toLocaleString("zh-CN", { hour12: false });
      if (p.iat !== undefined) rows.push(["签发 iat", fmt(p.iat)]);
      if (p.nbf !== undefined) rows.push(["生效 nbf", fmt(p.nbf)]);
      if (p.exp !== undefined) {
        const expMs = Number(p.exp) * 1000;
        rows.push(["过期 exp", fmt(p.exp)]);
        rows.push(["状态", expMs > Date.now() ? "有效（未过期）" : "已过期"]);
      }
      if (p.iss !== undefined) rows.push(["签发方 iss", String(p.iss)]);
      if (p.sub !== undefined) rows.push(["主题 sub", String(p.sub)]);
      setClaims(rows);
      setMsg("解析完成。注意：这里只做本地解码，不验证签名真伪。");
    } catch {
      setMsg("解析失败：内容不是有效的 JWT（Base64Url 编码的 JSON）。");
    }
  };
  return (
    <>
      <textarea style={{ ...inputStyle, minHeight: 100 }} placeholder="粘贴 JWT（eyJhbGciOi…）" value={input} onChange={(e) => setInput(e.target.value)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="button primary" onClick={parse}>解析</button>
        <button type="button" className="button secondary" onClick={() => { setInput(""); setHeader(""); setPayload(""); setClaims([]); setMsg(""); }}>清空</button>
      </div>
      {msg ? <p style={{ margin: 0, fontSize: 12, color: "#929dab" }}>{msg}</p> : null}
      {claims.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          {claims.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
              <span style={{ color: "#929dab" }}>{k}</span>
              <span style={{ textAlign: "right", wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : null}
      {header ? <pre style={{ ...inputStyle, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto", margin: 0 }}>Header{"\n"}{header}</pre> : null}
      {payload ? <pre style={{ ...inputStyle, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflow: "auto", margin: 0 }}>Payload{"\n"}{payload}</pre> : null}
    </>
  );
}

function TimestampTool() {
  const [now, setNow] = useState(() => Date.now());
  const [tsInput, setTsInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const parsed = (() => {
    const raw = tsInput.trim();
    if (!/^\d+$/.test(raw)) return "";
    const n = Number(raw);
    const ms = raw.length >= 13 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : `${d.toLocaleString("zh-CN", { hour12: false })}（${d.toISOString()}）`;
  })();
  const fromDate = (() => {
    if (!dateInput) return null;
    const ms = new Date(dateInput).getTime();
    if (Number.isNaN(ms)) return null;
    return { sec: Math.floor(ms / 1000), ms };
  })();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, flexWrap: "wrap" }}>
        <span style={{ color: "#929dab" }}>当前时间戳</span>
        <span>秒 {Math.floor(now / 1000)} · 毫秒 {now}</span>
      </div>
      <input style={inputStyle} inputMode="numeric" placeholder="输入时间戳：10 位秒 / 13 位毫秒" value={tsInput} onChange={(e) => setTsInput(e.target.value)} />
      {parsed ? <p style={{ margin: 0, fontSize: 12.5 }}>{parsed}</p> : null}
      <input style={inputStyle} type="datetime-local" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
      {fromDate ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="button secondary" onClick={() => void copyText(String(fromDate.sec))}>复制秒：{fromDate.sec}</button>
          <button type="button" className="button secondary" onClick={() => void copyText(String(fromDate.ms))}>复制毫秒：{fromDate.ms}</button>
        </div>
      ) : null}
    </>
  );
}

export default function Toolbox({ tools = DEFAULT_TOOLS }: { tools?: ToolboxToolMeta[] }) {
  const byId: Record<string, React.ReactNode> = {
    json: <JsonTool />,
    base64: <Base64Tool />,
    chars: <WordCountTool />,
    jwt: <JwtTool />,
    timestamp: <TimestampTool />,
  };
  const visible = tools.filter((t) => t.enabled && byId[t.id]);
  return (
    <>
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        {visible.map((t) => (
          <ToolCard key={t.id} title={t.name} desc={t.description}>
            {byId[t.id]}
          </ToolCard>
        ))}
      </div>
      <ToastHost />
    </>
  );
}
