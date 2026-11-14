// UniverseAdmin.tsx — 3D 宇宙管理中心（后台 Phase 5）。
// 管理 planet_config（行星展示属性）与 universe_settings（场景/开场/模式）。
// 编辑全部在本地草稿里，点「保存」才写库，点「取消」丢弃草稿；
// 未保存的改动绝不假装已生效。Supabase 未配置时只读本地默认值并明确
// 提示不可保存（不伪造保存成功）。
// 卫星不在此管理：当前卫星由构建时真实数据生成（最新文章/项目/书签），
// 见 src/lib/planets.ts 与 index.astro 的 planetSatellites。
import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { PLANETS, type PlanetDef, type PlanetId } from "@/lib/planets";

type PlanetRow = {
  id: string;
  name: string;
  name_en: string;
  func: string;
  path: string;
  description: string;
  icon: string;
  color: string;
  radius: number;
  orbit_radius: number;
  orbit_speed: number;
  spin_speed: number;
  initial_angle: number;
  axial_tilt: number;
  orbit_inclination: number;
  texture: string;
  ring_inner: number | null;
  ring_outer: number | null;
  enabled: boolean;
};

type SettingsRow = {
  default_mode: string;
  particle_density: string;
  effects_enabled: boolean;
  motion_default: string;
  boot_enabled: boolean;
  boot_brand: string;
  boot_subline: string;
  boot_duration_seconds: number;
  boot_sound_default: boolean;
  show_universe_entry: boolean;
  transition_enabled: boolean;
  mobile_full_3d: boolean;
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

const labelStyle: React.CSSProperties = { fontSize: 12, color: "#929dab", display: "block", marginBottom: 4 };

function toRow(p: PlanetDef, enabled = true): PlanetRow {
  return {
    id: p.id, name: p.name, name_en: p.nameEn, func: p.func, path: p.path,
    description: p.description, icon: p.icon, color: p.color,
    radius: p.radius, orbit_radius: p.orbitRadius, orbit_speed: p.orbitSpeed,
    spin_speed: p.spinSpeed, initial_angle: p.initialAngle, axial_tilt: p.axialTilt,
    orbit_inclination: p.orbitInclination, texture: p.texture,
    ring_inner: p.ring ? p.ring.inner : null, ring_outer: p.ring ? p.ring.outer : null,
    enabled,
  };
}

const defaultSettings = (): SettingsRow => ({
  default_mode: "universe",
  particle_density: "balanced",
  effects_enabled: true,
  motion_default: "on",
  boot_enabled: true,
  boot_brand: "OUTAI",
  boot_subline: "PERSONAL DIGITAL UNIVERSE",
  boot_duration_seconds: 6.5,
  boot_sound_default: false,
  show_universe_entry: true,
  transition_enabled: true,
  mobile_full_3d: true,
});

const MODE_OPTIONS = [
  { v: "universe", label: "UNIVERSE（总览）" },
  { v: "earth", label: "EARTH（地球特写）" },
  { v: "galaxy", label: "GALAXY（银河）" },
  { v: "navigation", label: "NAVIGATION（导航）" },
  { v: "solar", label: "SOLAR SYSTEM（太阳系）" },
];

export default function UniverseAdmin({ say }: { say: (kind: "ok" | "err", msg: string) => void }) {
  const [planets, setPlanets] = useState<PlanetRow[]>(PLANETS.map((p) => toRow(p)));
  const [settings, setSettings] = useState<SettingsRow>(defaultSettings());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanetRow | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsRow>(defaultSettings());
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);

  const configured = hasSupabaseConfig;

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("planet_config")
      .select("*")
      .order("orbit_radius", { ascending: true });
    if (error) {
      say("err", `加载行星配置失败：${error.message}（若表不存在，请先执行 migration 017）`);
      setLoading(false);
      return;
    }
    // 以 planets.ts 为基准，用库里的行覆盖；库里没有的行用默认值。
    const byId = new Map((rows ?? []).map((r: PlanetRow) => [r.id, r]));
    setPlanets(PLANETS.map((p) => {
      const r = byId.get(p.id);
      return r ? { ...toRow(p), ...r } : toRow(p);
    }));
    const { data: srows, error: serr } = await supabase
      .from("universe_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (serr) {
      say("err", `加载宇宙设置失败：${serr.message}`);
    } else if (srows) {
      const s = { ...defaultSettings(), ...srows };
      setSettings(s);
      setSettingsDraft(s);
    }
    setLoaded(true);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const startEdit = (row: PlanetRow) => {
    setEditingId(row.id);
    setForm({ ...row });
  };
  const cancelEdit = () => { setEditingId(null); setForm(null); };

  async function savePlanet() {
    if (!form || !supabase) return;
    if (!form.name.trim()) { say("err", "请填写行星名称。"); return; }
    if (form.radius <= 0 || form.orbit_radius < 0) { say("err", "半径须大于 0，轨道半径不能为负。"); return; }
    setSaving(true);
    const payload = { ...form };
    const { error } = await supabase.from("planet_config").upsert(payload, { onConflict: "id" });
    setSaving(false);
    if (error) { say("err", `保存失败：${error.message}`); return; }
    setPlanets((ps) => ps.map((p) => (p.id === form.id ? { ...form } : p)));
    setEditingId(null); setForm(null);
    say("ok", `行星“${form.name}”已保存（下次打开首页生效）。`);
  }

  async function toggleEnabled(row: PlanetRow) {
    if (!supabase) return;
    if (row.id === "sun") { say("err", "太阳是场景唯一主光源，不能隐藏。"); return; }
    const next = !row.enabled;
    const { error } = await supabase.from("planet_config")
      .upsert({ ...row, enabled: next }, { onConflict: "id" });
    if (error) { say("err", `保存失败：${error.message}`); return; }
    setPlanets((ps) => ps.map((p) => (p.id === row.id ? { ...p, enabled: next } : p)));
    say("ok", `行星“${row.name}”已${next ? "启用" : "隐藏"}（下次打开首页生效）。`);
  }

  async function resetPlanet(id: string) {
    const def = PLANETS.find((p) => p.id === id);
    if (!def || !supabase) return;
    const client = supabase;
    setConfirm({
      message: `把“${def.name}”恢复为内置默认值？（会覆盖当前保存的配置，未保存的草稿不受影响。）`,
      onYes: async () => {
        setConfirm(null);
        const { error } = await client.from("planet_config").upsert(toRow(def), { onConflict: "id" });
        if (error) { say("err", `恢复失败：${error.message}`); return; }
        setPlanets((ps) => ps.map((p) => (p.id === id ? toRow(def) : p)));
        if (editingId === id) { setEditingId(null); setForm(null); }
        say("ok", `行星“${def.name}”已恢复默认值。`);
      },
    });
  }

  async function saveSettings() {
    if (!supabase) return;
    if (!settingsDraft.boot_brand.trim()) { say("err", "请填写开场品牌文字。"); return; }
    if (settingsDraft.boot_duration_seconds < 2 || settingsDraft.boot_duration_seconds > 15) {
      say("err", "开场时长须在 2–15 秒之间。"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("universe_settings")
      .upsert({ id: "default", ...settingsDraft }, { onConflict: "id" });
    setSaving(false);
    if (error) { say("err", `保存失败：${error.message}`); return; }
    setSettings({ ...settingsDraft });
    setSettingsDirty(false);
    say("ok", "宇宙设置已保存（下次打开首页生效）。");
  }

  const set = <K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) => {
    setSettingsDraft((s) => ({ ...s, [key]: value }));
    setSettingsDirty(true);
  };

  if (!configured) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>3D 宇宙管理</h3>
        <p style={{ color: "#929dab", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          未配置 Supabase。下面显示的是内置默认值（仅预览，不可保存）。配置 Supabase 后，
          可在此编辑行星与宇宙/开场/模式设置，保存后下次打开首页生效。
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 4px" }}>3D 宇宙管理</h3>
        <p style={{ color: "#929dab", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          行星配置与宇宙设置保存在 Supabase（planet_config / universe_settings），
          保存后下次打开首页生效。编辑在本地草稿里，点「保存」才写库；
          卫星由构建时真实数据生成（最新文章/项目/书签），不在此管理。
          {loading ? "加载中…" : loaded ? "" : ""}
        </p>
        <div style={{ marginTop: 12 }}>
          <a className="button secondary" href="/" target="_blank" rel="noreferrer">在新标签页查看首页 3D ↗</a>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 12px" }}>行星</h4>
        <div style={{ display: "grid", gap: 10 }}>
          {planets.map((p) => (
            <div key={p.id} style={{ border: "1px solid #1e293b", borderRadius: 10, padding: 12, opacity: p.enabled ? 1 : 0.55 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <strong>{p.name}</strong>
                <span style={{ color: "#929dab", fontSize: 12 }}>{p.name_en} · {p.func} · {p.path}</span>
                <span style={{ color: "#929dab", fontSize: 12 }}>半径 {p.radius} · 轨道 {p.orbit_radius} · 公转 {p.orbit_speed} rad/s</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button className="button secondary" onClick={() => startEdit(p)}>编辑</button>
                  <button className="button secondary" onClick={() => resetPlanet(p.id)}>恢复默认</button>
                  <button className="button secondary" disabled={p.id === "sun"} onClick={() => toggleEnabled(p)}>
                    {p.enabled ? "隐藏" : "启用"}
                  </button>
                </span>
              </div>
              {editingId === p.id && form && (
                <div style={{ display: "grid", gap: 10, marginTop: 12, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                  <label><span style={labelStyle}>名称</span><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                  <label><span style={labelStyle}>英文名</span><input style={inputStyle} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></label>
                  <label><span style={labelStyle}>功能</span><input style={inputStyle} value={form.func} onChange={(e) => setForm({ ...form, func: e.target.value })} /></label>
                  <label><span style={labelStyle}>页面路径</span><input style={inputStyle} value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} /></label>
                  <label><span style={labelStyle}>图标</span><input style={inputStyle} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></label>
                  <label><span style={labelStyle}>颜色</span><input style={inputStyle} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
                  <label><span style={labelStyle}>半径</span><input style={inputStyle} type="number" step="0.05" min="0.1" value={form.radius} onChange={(e) => setForm({ ...form, radius: Number(e.target.value) })} /></label>
                  <label><span style={labelStyle}>轨道半径</span><input style={inputStyle} type="number" step="0.5" min="0" value={form.orbit_radius} onChange={(e) => setForm({ ...form, orbit_radius: Number(e.target.value) })} /></label>
                  <label><span style={labelStyle}>公转速度 rad/s</span><input style={inputStyle} type="number" step="0.001" value={form.orbit_speed} onChange={(e) => setForm({ ...form, orbit_speed: Number(e.target.value) })} /></label>
                  <label><span style={labelStyle}>自转速度 rad/s</span><input style={inputStyle} type="number" step="0.001" value={form.spin_speed} onChange={(e) => setForm({ ...form, spin_speed: Number(e.target.value) })} /></label>
                  <label><span style={labelStyle}>初始角度 rad</span><input style={inputStyle} type="number" step="0.1" value={form.initial_angle} onChange={(e) => setForm({ ...form, initial_angle: Number(e.target.value) })} /></label>
                  <label><span style={labelStyle}>自转轴倾角 rad</span><input style={inputStyle} type="number" step="0.01" value={form.axial_tilt} onChange={(e) => setForm({ ...form, axial_tilt: Number(e.target.value) })} /></label>
                  <label style={{ gridColumn: "1 / -1" }}><span style={labelStyle}>介绍</span><input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                    <button className="button primary" disabled={saving} onClick={savePlanet}>保存</button>
                    <button className="button secondary" onClick={cancelEdit}>取消（丢弃草稿）</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 12px" }}>场景 / 开场 / 模式设置</h4>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <label><span style={labelStyle}>默认视角</span>
            <select style={inputStyle} value={settingsDraft.default_mode} onChange={(e) => set("default_mode", e.target.value)}>
              {MODE_OPTIONS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </label>
          <label><span style={labelStyle}>粒子密度</span>
            <select style={inputStyle} value={settingsDraft.particle_density} onChange={(e) => set("particle_density", e.target.value)}>
              <option value="high">高</option>
              <option value="balanced">均衡（默认）</option>
              <option value="low">低（省性能）</option>
            </select>
          </label>
          <label><span style={labelStyle}>动效默认</span>
            <select style={inputStyle} value={settingsDraft.motion_default} onChange={(e) => set("motion_default", e.target.value)}>
              <option value="on">开</option>
              <option value="reduced">减弱（默认关 3D）</option>
            </select>
          </label>
          <label><span style={labelStyle}>开场品牌文字</span><input style={inputStyle} value={settingsDraft.boot_brand} onChange={(e) => set("boot_brand", e.target.value)} /></label>
          <label><span style={labelStyle}>开场副标题</span><input style={inputStyle} value={settingsDraft.boot_subline} onChange={(e) => set("boot_subline", e.target.value)} /></label>
          <label><span style={labelStyle}>开场时长（秒，2–15）</span><input style={inputStyle} type="number" step="0.5" min="2" max="15" value={settingsDraft.boot_duration_seconds} onChange={(e) => set("boot_duration_seconds", Number(e.target.value))} /></label>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 13 }}>
          {([
            ["effects_enabled", "特效（星云/光晕）"],
            ["boot_enabled", "开场动画"],
            ["boot_sound_default", "开场音效默认开"],
            ["show_universe_entry", "显示“进入宇宙”入口"],
            ["transition_enabled", "双模式切换动画"],
            ["mobile_full_3d", "手机端全屏 3D"],
          ] as [keyof SettingsRow, string][]).map(([key, label]) => (
            <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={!!settingsDraft[key]} onChange={(e) => set(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="button primary" disabled={saving || !settingsDirty} onClick={saveSettings}>保存设置</button>
          <button className="button secondary" disabled={!settingsDirty} onClick={() => { setSettingsDraft({ ...settings }); setSettingsDirty(false); }}>取消（丢弃草稿）</button>
          {settingsDirty && <span style={{ color: "#f59e0b", fontSize: 12, alignSelf: "center" }}>有未保存的改动</span>}
        </div>
      </div>

      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setConfirm(null)}>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6 }}>{confirm.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="button secondary" onClick={() => setConfirm(null)}>取消</button>
              <button className="button primary" onClick={confirm.onYes}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
