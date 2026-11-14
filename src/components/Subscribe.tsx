import React, { useState } from "react";

export default function Subscribe(){
  const [email,setEmail] = useState("");
  const [done,setDone] = useState(false);
  const [error,setError] = useState("");
  function submit(e: React.FormEvent){
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("请输入有效的邮箱地址。"); return; }
    setError("");
    setDone(true);
  }
  return <section className="card" style={{marginTop:24}}>
    <h3>订阅更新</h3>
    <p style={{color:"#929dab",fontSize:13}}>新文章发布时收到邮件通知。由 Buttondown 发送，可随时退订。</p>
    {done ? <p style={{color:"#b5f36b",fontSize:13,marginTop:12}}>订阅请求已发送，请去邮箱点击确认链接完成订阅。</p> : <form action="https://buttondown.com/api/emails/embed-subscribe/outaidage" method="post" target="buttondown-subscribe-frame" onSubmit={submit} style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
      <input className="field" type="email" name="email" placeholder="你的邮箱" value={email} onChange={e=>setEmail(e.target.value)} required style={{flex:"1 1 200px"}}/>
      <button className="button primary" type="submit">订阅</button>
    </form>}
    {error && <p style={{color:"#f28b82",fontSize:12,marginTop:8}}>{error}</p>}
    <iframe name="buttondown-subscribe-frame" title="订阅" style={{display:"none"}} aria-hidden="true" tabIndex={-1}></iframe>
  </section>;
}
