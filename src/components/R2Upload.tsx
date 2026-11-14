// R2Upload.tsx — Background Studio 的 R2 上传区。
// 拖放 / 选择文件 → 本地算 SHA-256（≤100MB 才算，更大的跳过去重以免爆内存）
// → 调 r2-upload-sign 取预签名 URL → 直接 PUT 到 R2（XHR 真实进度）
// → 成功后写入 background_assets（待审核除非填了许可证）。
// ≤50MB 单次 PUT；>50MB 走 S3 分片上传（5MB/片）。
// R2 未配置时函数会返回明确错误，界面如实显示，不伪造上传成功。
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
const MULTIPART_THRESHOLD = 50 * 1024 * 1024;
const HASH_LIMIT = 100 * 1024 * 1024;
const PART_SIZE = 5 * 1024 * 1024;

type QueueStatus =
  | "pending"
  | "hashing"
  | "signing"
  | "uploading"
  | "saving"
  | "done"
  | "duplicate"
  | "error";

type QueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  progress: number;
  detail: string;
  error: string;
  existingTitle: string;
};

type SignResponse = {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  existing?: { id: string; title: string; url: string; status: string };
  key?: string;
  url?: string;
  uploadId?: string;
  publicUrl?: string | null;
  media_kind?: "image" | "video";
  mime?: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a0d20",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e6edf3",
  padding: 8,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function titleFromFilename(name: string): string {
  const base = name.split("/").pop()?.split("\\").pop() || "未命名背景";
  return base.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || "未命名背景";
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getMediaMeta(file: File, previewUrl: string): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, duration: null });
      img.onerror = () => resolve({ width: null, height: null, duration: null });
      img.src = previewUrl;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve({ width: v.videoWidth || null, height: v.videoHeight || null, duration: Number.isFinite(v.duration) ? v.duration : null });
      v.onerror = () => resolve({ width: null, height: null, duration: null });
      v.src = previewUrl;
    }
  });
}

function xhrPut(url: string, blob: Blob, contentType: string | null, onProgress: (loaded: number, total: number) => void): Promise<{ status: number; etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, etag: xhr.getResponseHeader("ETag") });
    xhr.onerror = () => reject(new Error("网络错误，上传中断"));
    xhr.send(blob);
  });
}

export default function R2Upload({ say, onUploaded }: { say: (kind: "ok" | "err", msg: string) => void; onUploaded: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [category, setCategory] = useState("space");
  const [author, setAuthor] = useState("");
  const [license, setLicense] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function patch(id: string, p: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => {
      const ok = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"].includes(f.type);
      if (!ok) say("err", `不支持的文件类型：${f.name}（${f.type || "未知"}）。仅支持 JPG/PNG/WebP/GIF/MP4/WebM。`);
      return ok;
    });
    if (list.length === 0) return;
    setQueue((q) => [
      ...q,
      ...list.map((file, i) => ({
        id: `q-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pending" as QueueStatus,
        progress: 0,
        detail: "",
        error: "",
        existingTitle: "",
      })),
    ]);
  }

  async function uploadOne(item: QueueItem) {
    const { file } = item;
    const mediaKind = file.type.startsWith("video/") ? "video" : "image";
    try {
      // 1) SHA-256（≤100MB；更大的跳过去重）。
      let sha256 = "";
      if (file.size <= HASH_LIMIT && crypto.subtle) {
        patch(item.id, { status: "hashing", detail: "计算文件指纹…" });
        sha256 = await sha256Hex(file);
      }
      const meta = await getMediaMeta(file, item.previewUrl);
      // 2) 签发。
      patch(item.id, { status: "signing", detail: "向服务端申请上传凭证…" });
      const useMultipart = file.size > MULTIPART_THRESHOLD;
      const { data, error } = await supabase!.functions.invoke("r2-upload-sign", {
        body: {
          action: useMultipart ? "create-multipart" : "sign-put",
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          sha256: sha256 || undefined,
        },
      });
      if (error) throw new Error(`上传服务不可用：${error.message}`);
      const res = data as SignResponse;
      if (!res?.ok) throw new Error(res?.error || "签发上传凭证失败。");
      if (res.duplicate && res.existing) {
        patch(item.id, { status: "duplicate", detail: "已存在相同文件，未重复上传", existingTitle: res.existing.title });
        return;
      }
      if (!res.key) throw new Error("服务端未返回对象 key。");
      if (!res.publicUrl) {
        throw new Error("R2 公开访问地址未配置（R2_PUBLIC_BASE_URL）：文件未上传，请先在服务端配置 r2.dev 公开域名。");
      }
      // 3) 上传本体。
      patch(item.id, { status: "uploading", detail: "上传中…", progress: 0 });
      if (!useMultipart) {
        if (!res.url) throw new Error("服务端未返回上传地址。");
        const put = await xhrPut(res.url, file, file.type, (loaded, total) => {
          patch(item.id, { progress: Math.round((loaded / total) * 100) });
        });
        if (put.status < 200 || put.status >= 300) throw new Error(`R2 返回 HTTP ${put.status}，上传失败。`);
      } else {
        if (!res.uploadId) throw new Error("服务端未返回 uploadId。");
        const totalParts = Math.ceil(file.size / PART_SIZE);
        const etags: { ETag: string; PartNumber: number }[] = [];
        for (let part = 1; part <= totalParts; part++) {
          const start = (part - 1) * PART_SIZE;
          const chunk = file.slice(start, Math.min(start + PART_SIZE, file.size));
          const { data: partData, error: partErr } = await supabase!.functions.invoke("r2-upload-sign", {
            body: { action: "sign-part", key: res.key, uploadId: res.uploadId, partNumber: part },
          });
          if (partErr) throw new Error(`签发分片 ${part} 失败：${partErr.message}`);
          const partRes = partData as SignResponse;
          if (!partRes?.ok || !partRes.url) throw new Error(partRes?.error || `签发分片 ${part} 失败。`);
          const put = await xhrPut(partRes.url, chunk, null, (loaded, total) => {
            const done = (part - 1) * PART_SIZE + loaded;
            patch(item.id, { progress: Math.round((done / file.size) * 100), detail: `上传分片 ${part}/${totalParts}…` });
          });
          if (put.status < 200 || put.status >= 300) throw new Error(`分片 ${part} 上传失败（HTTP ${put.status}）。`);
          if (!put.etag) throw new Error(`分片 ${part} 未返回 ETag。`);
          etags.push({ ETag: put.etag, PartNumber: part });
        }
        patch(item.id, { status: "uploading", detail: "合并分片…" });
        const { data: doneData, error: doneErr } = await supabase!.functions.invoke("r2-upload-sign", {
          body: { action: "complete-multipart", key: res.key, uploadId: res.uploadId, parts: etags },
        });
        if (doneErr) throw new Error(`合并分片失败：${doneErr.message}`);
        if (!(doneData as SignResponse)?.ok) throw new Error((doneData as SignResponse)?.error || "合并分片失败。");
      }
      // 4) 写入资源库。
      patch(item.id, { status: "saving", detail: "写入资源库…", progress: 100 });
      const id = `r2-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const status = license.trim() ? "active" : "pending_review";
      const { error: insertErr } = await supabase!.from("background_assets").insert({
        id,
        title: titleFromFilename(file.name),
        description: "",
        media_kind: mediaKind,
        mime: file.type,
        url: res.publicUrl,
        thumbnail_url: mediaKind === "image" ? res.publicUrl : "",
        category,
        tags: [],
        source: "R2 上传",
        source_url: res.publicUrl,
        author: author.trim(),
        license: license.trim(),
        attribution: "",
        file_size_bytes: file.size,
        width: meta.width,
        height: meta.height,
        duration_seconds: meta.duration,
        file_hash: sha256 || null,
        status,
        enabled: true,
        is_featured: false,
      });
      if (insertErr) throw new Error(`文件已传到 R2，但写入资源库失败：${insertErr.message}（对象 key：${res.key}）。`);
      patch(item.id, { status: "done", detail: status === "active" ? "已上传并启用" : "已上传，进入待审核" });
      onUploaded();
    } catch (e) {
      patch(item.id, { status: "error", error: e instanceof Error ? e.message : "上传失败。" });
    }
  }

  async function startUpload() {
    const pending = queue.filter((q) => q.status === "pending" || q.status === "error");
    if (pending.length === 0) {
      say("err", "没有待上传的文件。");
      return;
    }
    setBusy(true);
    for (const item of pending) {
      patch(item.id, { error: "" });
      await uploadOne(item);
    }
    setBusy(false);
    const done = queue.filter((q) => q.status === "done").length;
    const dup = queue.filter((q) => q.status === "duplicate").length;
    const failed = queue.filter((q) => q.status === "error").length;
    if (done > 0) say("ok", `已上传 ${done} 个文件到 R2${dup > 0 ? `，${dup} 个重复已跳过` : ""}。`);
    if (failed > 0) say("err", `${failed} 个文件上传失败，见下方错误。`);
  }

  function clearFinished() {
    setQueue((q) => q.filter((it) => it.status === "pending" || it.status === "uploading" || it.status === "hashing" || it.status === "signing" || it.status === "saving"));
  }

  const pendingCount = queue.filter((q) => q.status === "pending" || q.status === "error").length;

  return (
    <div style={{ borderTop: "1px solid #29313c", paddingTop: 12, display: "grid", gap: 12 }}>
      <h4 style={{ margin: 0 }}>R2 上传</h4>
      <p style={{ margin: 0, fontSize: 12, color: "#929dab", lineHeight: 1.7 }}>
        文件直接上传到 Cloudflare R2（服务端只签发凭证，不经手文件）。支持 JPG/PNG/WebP/GIF（≤20MB）与 MP4/WebM（≤500MB）；超过 50MB 自动分片上传。上传前按 SHA-256 查重复，重复文件不会重复上传。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 4 }}>
          分类
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, width: 140 }}>
            <option value="space">space 太空</option>
            <option value="nature">nature 自然</option>
            <option value="city">city 城市</option>
            <option value="abstract">abstract 抽象</option>
            <option value="minimal">minimal 极简</option>
            <option value="other">other 其他</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 4, flex: "1 1 120px" }}>
          作者
          <input style={inputStyle} placeholder="作者（可选）" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label style={{ fontSize: 12, color: "#aab3c0", display: "grid", gap: 4, flex: "1 1 120px" }}>
          许可证
          <input style={inputStyle} placeholder="如 CC0（留空则进入待审核）" value={license} onChange={(e) => setLicense(e.target.value)} />
        </label>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInput.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#61edff" : "#29313c"}`,
          borderRadius: 12,
          padding: "28px 16px",
          textAlign: "center",
          fontSize: 13,
          color: dragOver ? "#61edff" : "#aab3c0",
          cursor: "pointer",
          background: dragOver ? "#0a1420" : "transparent",
        }}
      >
        把图片 / GIF / 视频拖到这里，或点击选择文件（可多选）
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {queue.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {queue.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #29313c", borderRadius: 8, padding: 8 }}>
              {it.file.type.startsWith("video/") ? (
                <video src={it.previewUrl} muted playsInline style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6, background: "#0a0d20" }} />
              ) : (
                <img src={it.previewUrl} alt={it.file.name} style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6, background: "#0a0d20" }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.file.name}</div>
                <div style={{ fontSize: 11, color: "#929dab" }}>
                  {(it.file.size / 1024 / 1024).toFixed(1)} MB · {it.file.type}
                  {it.status === "uploading" ? ` · ${it.progress}%` : ""}
                  {it.detail ? ` · ${it.detail}` : ""}
                  {it.status === "duplicate" && it.existingTitle ? ` · 已存在「${it.existingTitle}」` : ""}
                </div>
                {it.status === "uploading" ? (
                  <div style={{ height: 4, background: "#1e293b", borderRadius: 2, marginTop: 4 }}>
                    <div style={{ width: `${it.progress}%`, height: "100%", background: "#61edff", borderRadius: 2 }} />
                  </div>
                ) : null}
                {it.status === "error" && it.error ? <div style={{ fontSize: 11, color: "#f28b82", marginTop: 4 }}>{it.error}</div> : null}
                {it.status === "done" ? <div style={{ fontSize: 11, color: "#7dffce", marginTop: 4 }}>{it.detail || "已上传"}</div> : null}
                {it.status === "duplicate" ? <div style={{ fontSize: 11, color: "#f2c94c", marginTop: 4 }}>重复文件，已跳过</div> : null}
              </div>
              <span style={{ fontSize: 11, color: it.status === "done" ? "#7dffce" : it.status === "error" ? "#f28b82" : it.status === "duplicate" ? "#f2c94c" : "#aab3c0", whiteSpace: "nowrap" }}>
                {it.status === "pending" ? "待上传" : it.status === "hashing" ? "指纹…" : it.status === "signing" ? "签发…" : it.status === "uploading" ? "上传中" : it.status === "saving" ? "保存…" : it.status === "done" ? "完成" : it.status === "duplicate" ? "重复" : "失败"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="button primary" disabled={busy || pendingCount === 0} onClick={startUpload}>
          {busy ? "上传中…" : `开始上传（${pendingCount} 个）`}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={clearFinished}>清除已完成</button>
      </div>
    </div>
  );
}
