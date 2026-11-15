// Toolbox.tsx — 在线工具箱（数字宇宙门户）。
// 3 个真实可用的小工具，全部在浏览器本地运行，不上传任何数据：
// JSON 格式化与验证、Base64 编解码、字数统计。
// 工具的名称/说明/排序/启用由后台「工具箱」管理（toolbox_tools 表），
// 通过 tools prop 传入；工具逻辑按 id（json / base64 / chars）在代码里实现。
import { useState } from "react";
import { DEFAULT_TOOLS, type ToolboxToolMeta } from "@/lib/toolbox-tools";

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

export default function Toolbox({ tools = DEFAULT_TOOLS }: { tools?: ToolboxToolMeta[] }) {
  const byId: Record<string, React.ReactNode> = {
    json: <JsonTool />,
    base64: <Base64Tool />,
    chars: <WordCountTool />,
  };
  const visible = tools.filter((t) => t.enabled && byId[t.id]);
  return (
    <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
      {visible.map((t) => (
        <ToolCard key={t.id} title={t.name} desc={t.description}>
          {byId[t.id]}
        </ToolCard>
      ))}
    </div>
  );
}
