// r2-upload-sign — 为 Background Studio 管理员签发 R2 上传凭证。
// 仅管理员可调用（验证 Supabase JWT + admin_allowlist，按 user_id 查）。
// 客户端拿到预签名 URL 后直接 PUT 到 R2，文件本身不经过 Edge Function。
// 需要的 Function Secrets：R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY，
// R2_BUCKET（默认 outai-backgrounds）、R2_PUBLIC_BASE_URL（开启 r2.dev 公开访问后填入，
// 如 https://pub-xxxx.r2.dev，用于拼公开地址）、SUPABASE_URL、SUPABASE_ANON_KEY、
// SUPABASE_SERVICE_ROLE_KEY（用于按文件 SHA-256 查重复）。
// Actions：
//   sign-put         小文件单次上传：返回预签名 PUT URL（15 分钟有效）
//   create-multipart 大文件分片上传：返回 uploadId 与对象 key（>50MB 用分片）
//   sign-part        为指定分片签发预签名 PUT URL
//   complete-multipart 完成分片上传，返回最终 key 与公开地址
// 限制与 url-check 保持一致：图片 JPG/PNG/WebP/GIF ≤20MB，视频 MP4/WebM ≤500MB。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const ALLOWED_ORIGINS = new Set([
  "https://outaidage.xyz",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MULTIPART_THRESHOLD = 50 * 1024 * 1024;
const URL_EXPIRES_SECONDS = 900; // 15 分钟

function mediaLimits(contentType: string): { kind: "image" | "video"; maxBytes: number } | null {
  if (ALLOWED_IMAGE.has(contentType)) return { kind: "image", maxBytes: MAX_IMAGE_BYTES };
  if (ALLOWED_VIDEO.has(contentType)) return { kind: "video", maxBytes: MAX_VIDEO_BYTES };
  return null;
}

function safeFilename(name: string): string {
  const base = decodeURIComponent(name || "file").split("/").pop()?.split("\\").pop() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || "file";
}

function objectKey(filename: string): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rand = crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  return `backgrounds/${month}/${rand}-${safeFilename(filename)}`;
}

function publicUrlFor(key: string): string | null {
  const base = (Deno.env.get("R2_PUBLIC_BASE_URL") || "").replace(/\/+$/, "");
  return base ? `${base}/${key}` : null;
}

function getS3(): S3Client | null {
  const accountId = Deno.env.get("R2_ACCOUNT_ID") || "";
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") || "";
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405, headers);

  // 仅管理员可调用。
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "未登录。" }, 401, headers);
  const { data: allow } = await supabase.from("admin_allowlist").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!allow) return json({ ok: false, error: "仅管理员可上传背景。" }, 403, headers);

  const s3 = getS3();
  const bucket = Deno.env.get("R2_BUCKET") || "outai-backgrounds";
  if (!s3) return json({ ok: false, error: "R2 未配置：缺少 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY。" }, 500, headers);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "请求体不是合法 JSON。" }, 400, headers);
  }
  const action = String(body.action || "");
  if (!["sign-put", "create-multipart", "sign-part", "complete-multipart"].includes(action)) {
    return json({ ok: false, error: `未知操作：${action || "（空）"}。` }, 400, headers);
  }

  // ---- sign-put / create-multipart：校验文件信息，SHA-256 查重复 ----
  if (action === "sign-put" || action === "create-multipart") {
    const filename = String(body.filename || "");
    const contentType = String(body.contentType || "").split(";")[0].trim().toLowerCase();
    const sizeBytes = Number(body.sizeBytes || 0);
    const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : "";
    if (!filename) return json({ ok: false, error: "请提供 filename。" }, 400, headers);
    const limits = mediaLimits(contentType);
    if (!limits) {
      return json({ ok: false, error: `不支持的文件类型：${contentType || "未知"}。仅支持 JPG/PNG/WebP/GIF/MP4/WebM。` }, 400, headers);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return json({ ok: false, error: "请提供有效的文件大小 sizeBytes。" }, 400, headers);
    }
    if (sizeBytes > limits.maxBytes) {
      return json({ ok: false, error: `文件过大（${(sizeBytes / 1024 / 1024).toFixed(1)} MB，上限 ${(limits.maxBytes / 1024 / 1024).toFixed(0)} MB）。` }, 400, headers);
    }
    if (action === "create-multipart" && sizeBytes <= MULTIPART_THRESHOLD) {
      return json({ ok: false, error: `文件 ≤${MULTIPART_THRESHOLD / 1024 / 1024} MB 请用 sign-put 单次上传。` }, 400, headers);
    }
    if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) {
      return json({ ok: false, error: "sha256 格式不正确（应为 64 位十六进制）。" }, 400, headers);
    }
    // SHA-256 查重复：已有相同文件且未损坏的，直接返回已有资源，不再签发。
    if (sha256) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const { data: dup } = await admin.from("background_assets").select("id,title,url,status")
        .eq("file_hash", sha256).neq("status", "broken").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (dup) {
        return json({ ok: true, duplicate: true, existing: dup }, 200, headers);
      }
    }
    const key = objectKey(filename);
    try {
      if (action === "sign-put") {
        const url = await getSignedUrl(s3, new PutObjectCommand({
          Bucket: bucket, Key: key, ContentType: contentType,
        }), { expiresIn: URL_EXPIRES_SECONDS });
        return json({
          ok: true, duplicate: false, key, url, publicUrl: publicUrlFor(key),
          media_kind: limits.kind, mime: contentType, expiresIn: URL_EXPIRES_SECONDS,
        }, 200, headers);
      }
      const out = await s3.send(new CreateMultipartUploadCommand({
        Bucket: bucket, Key: key, ContentType: contentType,
      }));
      if (!out.UploadId) return json({ ok: false, error: "创建分片上传失败。" }, 500, headers);
      return json({
        ok: true, duplicate: false, key, uploadId: out.UploadId, publicUrl: publicUrlFor(key),
        media_kind: limits.kind, mime: contentType,
      }, 200, headers);
    } catch (e) {
      return json({ ok: false, error: `签发上传凭证失败：${e instanceof Error ? e.message : "未知错误"}` }, 500, headers);
    }
  }

  // ---- sign-part：为指定分片签发 URL ----
  if (action === "sign-part") {
    const key = String(body.key || "");
    const uploadId = String(body.uploadId || "");
    const partNumber = Number(body.partNumber || 0);
    if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return json({ ok: false, error: "请提供 key、uploadId 与 1–10000 的 partNumber。" }, 400, headers);
    }
    try {
      const url = await getSignedUrl(s3, new UploadPartCommand({
        Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber,
      }), { expiresIn: URL_EXPIRES_SECONDS });
      return json({ ok: true, key, uploadId, partNumber, url, expiresIn: URL_EXPIRES_SECONDS }, 200, headers);
    } catch (e) {
      return json({ ok: false, error: `签发分片 URL 失败：${e instanceof Error ? e.message : "未知错误"}` }, 500, headers);
    }
  }

  // ---- complete-multipart：完成分片上传 ----
  const key = String(body.key || "");
  const uploadId = String(body.uploadId || "");
  const parts = body.parts;
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return json({ ok: false, error: "请提供 key、uploadId 与非空的 parts 数组。" }, 400, headers);
  }
  const normalized = parts.map((p) => {
    const o = p as { ETag?: unknown; PartNumber?: unknown };
    return { ETag: String(o.ETag || "").replace(/^"|"$/g, ""), PartNumber: Number(o.PartNumber || 0) };
  });
  if (normalized.some((p) => !p.ETag || !Number.isInteger(p.PartNumber) || p.PartNumber < 1)) {
    return json({ ok: false, error: "parts 格式不正确：每项需要 ETag 与 PartNumber。" }, 400, headers);
  }
  try {
    await s3.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: normalized },
    }));
    return json({ ok: true, key, publicUrl: publicUrlFor(key) }, 200, headers);
  } catch (e) {
    return json({ ok: false, error: `完成分片上传失败：${e instanceof Error ? e.message : "未知错误"}` }, 500, headers);
  }
});
