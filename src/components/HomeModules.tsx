// HomeModules.tsx — 首页模块网格（数字宇宙门户）。
// 以构建时传入的模块为初始内容，挂载后从 Supabase 拉取最新已发布模块，
// 这样管理员在后台增删改排后，首页下次打开即自动更新，无需重新部署。
// 拉取失败时保留初始内容，不显示错误、不造假数据。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { HomeModule } from "@/lib/home-modules";

export default function HomeModules({ initial, base }: { initial: HomeModule[]; base: string }) {
  const [modules, setModules] = useState<HomeModule[]>(initial);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("home_modules")
      .select("id,name,name_en,description,icon,cover_image,theme_color,path,category,sort_order,show_on_home,enabled,show_in_nav,featured,status")
      .eq("status", "published")
      .eq("enabled", true)
      .eq("show_on_home", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data || data.length === 0) return;
        setModules(data as HomeModule[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (modules.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>还没有启用的首页模块。请在后台 → 首页模块管理中添加。</p>
      </div>
    );
  }

  return (
    <div className="module-grid-wrap">
      <span className="orbit-ring module-orbit-a" aria-hidden="true" />
      <span className="orbit-ring purple module-orbit-b" aria-hidden="true" />
      <div className="card-grid reveal-group module-grid">
      {modules.map((m, i) => (
        <a
          key={m.id}
          className={`card module-card${m.featured ? " is-featured" : ""}`}
          data-tilt
          data-reveal
          style={{ textDecoration: "none", borderTop: `2px solid ${m.theme_color}`, ["--i" as string]: i } as React.CSSProperties}
          href={`${base.replace(/\/$/, "")}${m.path}`}
        >
          <span className="module-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                fontSize: 22,
                color: m.theme_color,
                width: 40,
                height: 40,
                display: "grid",
                placeItems: "center",
                border: `1px solid ${m.theme_color}55`,
                borderRadius: 10,
                background: `${m.theme_color}14`,
                flexShrink: 0,
              }}
            >
              {m.icon}
            </span>
            <span>
              <strong style={{ fontSize: 15, display: "block" }}>{m.name}</strong>
              <span style={{ fontSize: 11, color: "#929dab" }}>{m.name_en}</span>
            </span>
            {m.featured ? (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#f2c94c", border: "1px solid #f2c94c55", borderRadius: 999, padding: "2px 7px" }}>
                推荐
              </span>
            ) : null}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#aab3c0", lineHeight: 1.6 }}>{m.description}</p>
          {m.cover_image ? (
            <img src={m.cover_image} alt="" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, marginTop: 10, border: "1px solid #1e293b" }} />
          ) : null}
          <span style={{ display: "inline-block", marginTop: 12, fontSize: 12, color: m.theme_color }}>进入 →</span>
        </a>
      ))}
      </div>
    </div>
  );
}
