import { useState, useEffect, useCallback, useRef } from "react";
import { loadTransactions, saveTransaction, deleteTransaction, loadProfile } from "./db.js";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bg:       "#F0F4F8",
  surf:     "#FFFFFF",
  surf2:    "#F7F9FC",
  border:   "#E4EAF2",
  text:     "#0B1120",
  text2:    "#3D4E6B",
  muted:    "#8A9BBF",
  dim:      "#C8D3E8",
  green:    "#16C784",
  greenDk:  "#0DA86A",
  greenSft: "#E6F9F2",
  red:      "#F0514F",
  redSft:   "#FEF0F0",
  yellow:   "#F5A623",
  yellowSft:"#FEF7E6",
  blue:     "#4F7EF7",
  blueSft:  "#EEF3FE",
};

const shadow = {
  xs: "0 1px 2px rgba(11,17,32,0.04)",
  sm: "0 2px 8px rgba(11,17,32,0.06), 0 1px 2px rgba(11,17,32,0.04)",
  md: "0 4px 20px rgba(11,17,32,0.08), 0 2px 6px rgba(11,17,32,0.04)",
  lg: "0 8px 40px rgba(11,17,32,0.10), 0 4px 12px rgba(11,17,32,0.05)",
  green: "0 8px 32px rgba(22,199,132,0.25)",
};

// ─── Categories ───────────────────────────────────────────────────────────────
const CATS = [
  { id:"moradia",       label:"Moradia",       icon:"🏠", color:"#4F7EF7", bg:"#EEF3FE", bucket:"necessidades" },
  { id:"alimentacao",   label:"Alimentação",   icon:"🍽️", color:"#F5A623", bg:"#FEF7E6", bucket:"necessidades" },
  { id:"transporte",    label:"Transporte",    icon:"🚗", color:"#7C5CFC", bg:"#F0EDFF", bucket:"necessidades" },
  { id:"saude",         label:"Saúde",         icon:"💊", color:"#F0514F", bg:"#FEF0F0", bucket:"necessidades" },
  { id:"servicos",      label:"Serviços",      icon:"⚡", color:"#0EA5E9", bg:"#E0F4FD", bucket:"necessidades" },
  { id:"educacao",      label:"Educação",      icon:"📚", color:"#8B5CF6", bg:"#F3EEFF", bucket:"desejos"      },
  { id:"lazer",         label:"Lazer",         icon:"🎮", color:"#EC4899", bg:"#FDE9F4", bucket:"desejos"      },
  { id:"vestuario",     label:"Vestuário",     icon:"👗", color:"#06B6D4", bg:"#E0F9FC", bucket:"desejos"      },
  { id:"outros",        label:"Outros",        icon:"📦", color:"#94A3B8", bg:"#F1F5F9", bucket:"desejos"      },
  { id:"investimentos", label:"Investimentos", icon:"📈", color:"#16C784", bg:"#E6F9F2", bucket:"investimentos" },
  { id:"receita",       label:"Receita",       icon:"💰", color:"#16C784", bg:"#E6F9F2", bucket:null            },
];

const BUCKETS = {
  necessidades: { label:"Necessidades", pct:50, color:"#4F7EF7", icon:"🏡",
    tip_over:"Gastos essenciais acima de 50%. Revise aluguel, planos e alimentação.",
    tip_ok:"Necessidades dentro do ideal ✓" },
  desejos: { label:"Desejos", pct:30, color:"#EC4899", icon:"✨",
    tip_over:"Desejos acima de 30%. Avalie assinaturas e compras por impulso.",
    tip_ok:"Gastos com desejos equilibrados ✓" },
  investimentos: { label:"Investimentos", pct:20, color:"#16C784", icon:"📈",
    tip_low:"Você está investindo menos de 20%. Automatize uma reserva mensal.",
    tip_ok:"Você está investindo o suficiente ✓" },
};

const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const fmt = (v) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const fmtShort = (v) => {
  if (Math.abs(v) >= 1000) return `R$ ${(v/1000).toFixed(1)}k`;
  return fmt(v);
};
const mk = (d) => { const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`; };
const getCat = (id) => CATS.find(c=>c.id===id)||CATS.at(-1);

// ─── API Key (Anthropic) ──────────────────────────────────────────────────────
function loadKey() {
  if (import.meta.env.VITE_ANTHROPIC_API_KEY) return import.meta.env.VITE_ANTHROPIC_API_KEY;
  return localStorage.getItem("oj:apikey")||"";
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function extractReceipt(b64, mime, key) {
  const today = new Date().toISOString().slice(0,10);
  const r = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:600,
      messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:mime,data:b64}},
        {type:"text",text:`Analise este comprovante. Retorne APENAS JSON sem markdown:
{"tipo":"despesa"|"receita","valor":number,"descricao":"string","data":"YYYY-MM-DD" (padrão:${today}),"categoria":"moradia|alimentacao|transporte|saude|servicos|educacao|lazer|vestuario|outros|investimentos|receita","estabelecimento":"string"}
Se não identificar: {"erro":"nao_identificado"}`}
      ]}]
    })
  });
  const d = await r.json();
  const t = d.content?.find(c=>c.type==="text")?.text||"{}";
  return JSON.parse(t.replace(/```json|```/g,"").trim());
}

// ─── Smart Insights ───────────────────────────────────────────────────────────
function buildInsights(mTxs, receitas, despesas, txs, month) {
  const ins = [];
  if (receitas > 0) {
    const rate = Math.round((receitas - despesas) / receitas * 100);
    if (rate > 0) ins.push({icon:"🎯",text:`Você economizou ${rate}% da renda esse mês`,type:"positive"});
    else ins.push({icon:"⚠️",text:`Gastos ${Math.abs(rate)}% acima da renda — hora de ajustar`,type:"negative"});
  }
  const catMap = {};
  mTxs.filter(t=>t.tipo==="despesa").forEach(t=>{ catMap[t.categoria]=(catMap[t.categoria]||0)+(t.pfValor??t.valor); });
  const top = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
  if (top) { const c=getCat(top[0]); ins.push({icon:c.icon,text:`${c.label} foi sua maior despesa: ${fmt(top[1])}`,type:"neutral"}); }
  const prevMk = (() => { const d=new Date(month+"-01"); d.setMonth(d.getMonth()-1); return mk(d); })();
  const prevTxs = txs.filter(t=>mk(t.data)===prevMk&&t.tipo==="despesa");
  const prevTotal = prevTxs.reduce((s,t)=>s+(t.pfValor??t.valor),0);
  if (prevTotal > 0 && despesas > 0) {
    const diff = Math.round((despesas-prevTotal)/prevTotal*100);
    if (diff < 0) ins.push({icon:"📉",text:`Você gastou ${Math.abs(diff)}% menos que no mês anterior`,type:"positive"});
    else if (diff > 10) ins.push({icon:"📈",text:`Gastos ${diff}% maiores que no mês anterior`,type:"negative"});
  }
  const invested = mTxs.filter(t=>t.categoria==="investimentos").reduce((s,t)=>s+(t.pfValor??t.valor),0);
  if (invested > 0 && receitas > 0) {
    const p = Math.round(invested/receitas*100);
    if (p >= 20) ins.push({icon:"🏆",text:`Você investiu ${p}% da renda — acima da meta!`,type:"positive"});
  }
  return ins.slice(0,3);
}

// ─── Donut ────────────────────────────────────────────────────────────────────
function Donut({ data, size=160, centerLabel="" }) {
  const total = data.reduce((s,d)=>s+d.value,0);
  if (!total) return (
    <div style={{width:size,height:size,borderRadius:"50%",background:T.surf2,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{fontSize:11,color:T.muted}}>Sem dados</span>
    </div>
  );
  let cum=0;
  const cx=size/2,cy=size/2,r=size*0.4,ir=size*0.27;
  const slices = data.map(d=>{
    const pct=d.value/total, a0=cum*2*Math.PI-Math.PI/2; cum+=pct;
    const a1=cum*2*Math.PI-Math.PI/2;
    const lg=pct>0.5?1:0;
    const pt=(a,rr)=>({x:cx+rr*Math.cos(a),y:cy+rr*Math.sin(a)});
    const p0=pt(a0,r),p1=pt(a1,r),i0=pt(a0,ir),i1=pt(a1,ir);
    return {...d,path:`M${p0.x} ${p0.y} A${r} ${r} 0 ${lg} 1 ${p1.x} ${p1.y} L${i1.x} ${i1.y} A${ir} ${ir} 0 ${lg} 0 ${i0.x} ${i0.y}Z`};
  });
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size}>
        <defs>
          <filter id="ds"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.08"/></filter>
        </defs>
        {slices.map((s,i)=><path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2.5" filter="url(#ds)"/>)}
        <circle cx={cx} cy={cy} r={ir-3} fill="#fff"/>
      </svg>
      {centerLabel && (
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
          <span style={{fontSize:10,color:T.muted,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>Total</span>
          <span style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"JetBrains Mono,monospace"}}>{fmtShort(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({pct,color,height=8}) {
  return (
    <div style={{height,background:T.surf2,borderRadius:height,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:color,borderRadius:height,transition:"width 1s cubic-bezier(.4,0,.2,1)"}}/>
    </div>
  );
}

// ─── Setup / Onboarding ───────────────────────────────────────────────────────
function SetupScreen({onSave}) {
  const [key,setKey]=useState("");
  const [step,setStep]=useState("welcome"); // welcome | apikey
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Sora','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>
      <div style={{maxWidth:380,width:"100%"}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{width:72,height:72,borderRadius:22,background:`linear-gradient(135deg,${T.green},#0EA5E9)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,margin:"0 auto 16px",boxShadow:shadow.green}}>📊</div>
          <div style={{fontSize:30,fontWeight:800,letterSpacing:-1}}>
            <span style={{color:T.text}}>Organiza</span><span style={{color:T.green}}>Já</span>
          </div>
          <div style={{fontSize:13,color:T.muted,marginTop:4,fontWeight:400}}>Suas finanças, organizadas já.</div>
        </div>

        {step==="welcome" && (
          <div>
            {/* Social buttons (visual only — for future auth) */}
            {[
              {icon:"🍎",label:"Continuar com Apple",bg:"#000",color:"#fff"},
              {icon:"🔵",label:"Continuar com Google",bg:"#fff",color:T.text,border:`1.5px solid ${T.border}`},
            ].map(b=>(
              <button key={b.label} onClick={()=>setStep("apikey")}
                style={{width:"100%",padding:"14px 20px",borderRadius:14,marginBottom:10,border:b.border||"none",background:b.bg,color:b.color,fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:shadow.sm,transition:"transform .15s, box-shadow .15s"}}
                onMouseOver={e=>e.currentTarget.style.transform="translateY(-1px)"}
                onMouseOut={e=>e.currentTarget.style.transform="none"}>
                <span>{b.icon}</span>{b.label}
              </button>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0"}}>
              <div style={{flex:1,height:1,background:T.border}}/><span style={{fontSize:12,color:T.muted}}>ou</span><div style={{flex:1,height:1,background:T.border}}/>
            </div>
            <button onClick={()=>setStep("apikey")}
              style={{width:"100%",padding:"14px",borderRadius:14,border:`1.5px solid ${T.border}`,background:T.surf,color:T.text2,fontFamily:"inherit",fontSize:14,fontWeight:500,cursor:"pointer",boxShadow:shadow.xs}}>
              Entrar com chave de API
            </button>
            <p style={{fontSize:11,color:T.muted,textAlign:"center",marginTop:16,lineHeight:1.6}}>
              Ao continuar você concorda com os Termos de Uso e Política de Privacidade do OrganizaJá.
            </p>
          </div>
        )}

        {step==="apikey" && (
          <div style={{background:T.surf,borderRadius:24,padding:24,boxShadow:shadow.md}}>
            <button onClick={()=>setStep("welcome")} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,fontSize:13,marginBottom:16,fontFamily:"inherit",padding:0}}>← Voltar</button>
            <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:6}}>Configure a IA</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:20,lineHeight:1.6}}>
              Para analisar comprovantes automaticamente, insira sua chave da{" "}
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:T.green,fontWeight:600,textDecoration:"none"}}>API Anthropic</a>.
            </div>
            <input type="password" placeholder="sk-ant-..." value={key} onChange={e=>setKey(e.target.value)}
              style={{background:T.surf2,border:`1.5px solid ${key.startsWith("sk-")?T.green:T.border}`,borderRadius:12,color:T.text,padding:"12px 14px",fontSize:14,fontFamily:"'JetBrains Mono',monospace",width:"100%",outline:"none",marginBottom:14,transition:"border-color .2s"}}/>
            <button onClick={()=>{localStorage.setItem("oj:apikey",key);onSave(key);}}
              disabled={!key.startsWith("sk-")}
              style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:key.startsWith("sk-")?`linear-gradient(135deg,${T.green},${T.greenDk})`:"#E2E8F0",color:key.startsWith("sk-")?"#fff":T.muted,fontFamily:"'Sora',sans-serif",fontSize:14,fontWeight:700,cursor:key.startsWith("sk-")?"pointer":"default",boxShadow:key.startsWith("sk-")?shadow.green:"none",transition:"all .2s"}}>
              Acessar OrganizaJá →
            </button>
            <p style={{fontSize:11,color:T.dim,marginTop:12,textAlign:"center"}}>Sua chave é salva apenas localmente no seu dispositivo.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function OrganizaJa({ user, onLogout }) {
  const [apiKey,setApiKey]=useState(()=>loadKey());
  const [txs,setTxs]=useState([]);
  const [loadingData,setLoadingData]=useState(true);
  const [profile,setProfile]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [subTab,setSubTab]=useState("geral");
  const [month,setMonth]=useState(()=>mk(new Date()));
  const [uploading,setUploading]=useState(false);
  const [uploadErr,setUploadErr]=useState("");
  const [showModal,setShowModal]=useState(false);
  const [form,setForm]=useState(null);
  const fileRef=useRef(); const camRef=useRef(); const dropRef=useRef();

  // Carrega dados do Supabase
  useEffect(()=>{
    if(!user) return;
    Promise.all([loadTransactions(user.id), loadProfile(user.id)])
      .then(([txData, profileData])=>{
        setTxs(txData||[]);
        setProfile(profileData);
      })
      .finally(()=>setLoadingData(false));
  },[user]);

  const persist = useCallback(async(action, payload)=>{
    if(action==="add") {
      const saved = await saveTransaction(user.id, payload);
      setTxs(prev=>[{ ...payload, id: saved.id }, ...prev]);
    } else if(action==="delete") {
      await deleteTransaction(payload);
      setTxs(prev=>prev.filter(t=>t.id!==payload));
    }
  },[user]);

  if(loadingData) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:40,height:40,border:`3px solid ${T.border}`,borderTopColor:T.green,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ─ Computed
  const mTxs=txs.filter(t=>mk(t.data)===month);
  const receitas=mTxs.filter(t=>t.tipo==="receita").reduce((s,t)=>s+t.valor,0);
  const despesas=mTxs.filter(t=>t.tipo==="despesa").reduce((s,t)=>s+t.valor,0);
  const saldo=receitas-despesas;
  const pfDespesas=mTxs.filter(t=>t.tipo==="despesa").reduce((s,t)=>s+(t.pfValor??t.valor),0);
  const pjDespesas=mTxs.filter(t=>t.tipo==="despesa"&&t.isPJ).reduce((s,t)=>s+(t.pjValor??0),0);

  const bucketTotals={necessidades:0,desejos:0,investimentos:0};
  mTxs.filter(t=>t.tipo==="despesa").forEach(t=>{const c=getCat(t.categoria);if(c.bucket)bucketTotals[c.bucket]+=(t.pfValor??t.valor);});

  const catBreak=CATS.filter(c=>c.id!=="receita").map(c=>({...c,value:mTxs.filter(t=>t.tipo==="despesa"&&t.categoria===c.id).reduce((s,t)=>s+(t.pfValor??t.valor),0)})).filter(c=>c.value>0).sort((a,b)=>b.value-a.value);
  const maxCat=catBreak[0]?.value||0;
  const months=[...new Set(txs.map(t=>mk(t.data)))].sort().reverse();
  if(!months.includes(month))months.unshift(month);
  const selMon=parseInt(month.split("-")[1]);
  const selYear=month.split("-")[0];
  const insights=buildInsights(mTxs,receitas,despesas,txs,month);

  // ─ Handlers
  const handleFiles=async(files)=>{
    const f=files[0];if(!f)return;
    setUploading(true);setUploadErr("");
    try{
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f);});
      const d=await extractReceipt(b64,f.type||"image/jpeg",apiKey);
      if(d.erro)setUploadErr("Não identifiquei dados financeiros. Tente adicionar manualmente.");
      else openForm({...d,isPJ:false,pjPct:30},"confirm");
    }catch{setUploadErr("Erro ao processar. Verifique sua conexão.");}
    setUploading(false);
  };
  const openForm=(base,mode)=>{setForm({tipo:"despesa",descricao:"",valor:"",data:new Date().toISOString().slice(0,10),categoria:"outros",estabelecimento:"",isPJ:false,pjPct:30,...base,_mode:mode});setShowModal(true);};
  const saveForm=async()=>{
    if(!form.descricao||!form.valor)return;
    const valor=parseFloat(String(form.valor).replace(",","."));
    const pjValor=form.isPJ?+(valor*form.pjPct/100).toFixed(2):0;
    const pfValor=+(valor-pjValor).toFixed(2);
    const tx={...form,valor,pjValor,pfValor};
    delete tx._mode; delete tx.id;
    await persist("add",tx);
    setShowModal(false);setForm(null);setMonth(mk(tx.data));setTab("dashboard");
  };
  const deleteTx=async(id)=>await persist("delete",id);

  // ─ Styles
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;}
    body{background:${T.bg};}
    .card{background:#fff;border-radius:20px;box-shadow:${shadow.sm};}
    .card-hover{transition:box-shadow .2s,transform .2s;}
    .card-hover:hover{box-shadow:${shadow.md};transform:translateY(-1px);}
    .btn{border:none;cursor:pointer;font-family:'Sora',sans-serif;transition:all .18s;}
    .btn-green{background:linear-gradient(135deg,${T.green},${T.greenDk});color:#fff;border-radius:14px;padding:13px 22px;font-size:14px;font-weight:700;box-shadow:${shadow.green};}
    .btn-green:hover{filter:brightness(1.06);transform:translateY(-1px);}
    .btn-outline{background:#fff;border:1.5px solid ${T.border};color:${T.text2};border-radius:12px;padding:10px 18px;font-size:13px;font-weight:500;}
    .btn-outline:hover{border-color:${T.green};color:${T.green};}
    .tx{transition:background .15s;}
    .tx:hover{background:${T.surf2}!important;}
    .drop-active{border-color:${T.green}!important;background:${T.greenSft}!important;}
    input,select{background:${T.surf2};border:1.5px solid ${T.border};border-radius:12px;color:${T.text};padding:11px 14px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;outline:none;transition:border-color .2s,box-shadow .2s;}
    input:focus,select:focus{border-color:${T.green};box-shadow:0 0 0 3px ${T.greenSft};}
    select option{background:#fff;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .fade{animation:fadeUp .3s ease;}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
    ::-webkit-scrollbar{display:none;}
    .pill-active::after{content:'';position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);width:20px;height:3px;background:${T.green};border-radius:2px;}
  `;

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',sans-serif",maxWidth:480,margin:"0 auto"}}>
      <style>{CSS}</style>

      {/* ── Header ── */}
      <div style={{position:"sticky",top:0,zIndex:20,background:`${T.bg}f0`,backdropFilter:"blur(20px)",padding:"16px 20px 0",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:12,background:`linear-gradient(135deg,${T.green},#0EA5E9)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,boxShadow:"0 4px 12px rgba(22,199,132,0.3)"}}>📊</div>
            <div>
              <div style={{fontSize:18,fontWeight:800,letterSpacing:-0.5,fontFamily:"'Sora',sans-serif"}}>
                <span style={{color:T.text}}>Organiza</span><span style={{color:T.green}}>Já</span>
              </div>
              <div style={{fontSize:10,color:T.muted,letterSpacing:0.3,fontWeight:500}}>Suas finanças, organizadas já.</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button className="btn btn-green" onClick={()=>openForm({tipo:"despesa",isPJ:false,pjPct:30},"manual")} style={{padding:"8px 16px",fontSize:13,borderRadius:12}}>+ Novo</button>
            <button onClick={onLogout} title="Sair"
              style={{width:36,height:36,borderRadius:10,background:T.surf2,border:`1px solid ${T.border}`,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
              👤
            </button>
          </div>
        </div>
        {/* Tab bar */}
        <div style={{display:"flex",gap:0}}>
          {[["dashboard","📊 Resumo"],["upload","📷 Comprovante"],["transactions","📋 Lançamentos"]].map(([id,lb])=>(
            <button key={id} className="btn" onClick={()=>setTab(id)} style={{flex:1,padding:"10px 4px",borderRadius:0,fontSize:12,fontWeight:tab===id?700:500,color:tab===id?T.green:T.muted,background:"transparent",borderBottom:tab===id?`2.5px solid ${T.green}`:"2.5px solid transparent",transition:"all .2s"}}>
              {lb}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 16px 80px"}}>

        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard"&&(
          <div className="fade" style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Month pills */}
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
              {months.slice(0,8).map(m=>{
                const [y,mo]=m.split("-");
                return(
                  <button key={m} className="btn" onClick={()=>setMonth(m)}
                    style={{flexShrink:0,padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:600,border:"1.5px solid",transition:"all .2s",
                      borderColor:month===m?T.green:T.border,
                      background:month===m?T.green:"#fff",
                      color:month===m?"#fff":T.muted,
                      boxShadow:month===m?shadow.green:shadow.xs}}>
                    {MONTHS_PT[parseInt(mo)-1].slice(0,3)} {y}
                  </button>
                );
              })}
            </div>

            {/* Sub-tabs */}
            <div style={{display:"flex",gap:8,background:"#fff",padding:4,borderRadius:14,boxShadow:shadow.xs}}>
              {[["geral","Geral"],["pfpj","PF / PJ"],["metodo","50·30·20"]].map(([id,lb])=>(
                <button key={id} className="btn" onClick={()=>setSubTab(id)}
                  style={{flex:1,padding:"8px 4px",borderRadius:10,fontSize:12,fontWeight:600,transition:"all .2s",
                    background:subTab===id?T.green:"transparent",
                    color:subTab===id?"#fff":T.muted}}>
                  {lb}
                </button>
              ))}
            </div>

            {/* ── Geral ── */}
            {subTab==="geral"&&(
              <>
                {/* Hero Balance Card */}
                <div style={{borderRadius:24,padding:24,background:saldo>=0?`linear-gradient(135deg,${T.green} 0%,#0EA5E9 100%)`:`linear-gradient(135deg,#F0514F 0%,#EC4899 100%)`,boxShadow:saldo>=0?shadow.green:"0 8px 32px rgba(240,81,79,0.25)",color:"#fff",position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.08)"}}/>
                  <div style={{position:"absolute",bottom:-50,left:-20,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.06)"}}/>
                  <div style={{fontSize:11,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",opacity:0.8,marginBottom:6,fontFamily:"'Sora',sans-serif"}}>Saldo em {MONTHS_PT[selMon-1]}</div>
                  <div style={{fontSize:36,fontWeight:800,letterSpacing:-1,fontFamily:"'Sora',sans-serif",marginBottom:4}}>{fmt(saldo)}</div>
                  <div style={{fontSize:12,opacity:0.75}}>{mTxs.length} lançamento{mTxs.length!==1?"s":""} · {selYear}</div>
                </div>

                {/* Income / Expense row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[{l:"Entradas",v:receitas,c:T.green,bg:T.greenSft,ic:"↑"},{l:"Saídas",v:despesas,c:T.red,bg:T.redSft,ic:"↓"}].map(({l,v,c,bg,ic})=>(
                    <div key={l} className="card card-hover" style={{padding:18}}>
                      <div style={{width:34,height:34,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:10}}>{ic}</div>
                      <div style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>{l}</div>
                      <div style={{fontSize:17,fontWeight:700,color:c,fontFamily:"'Sora',sans-serif"}}>{fmt(v)}</div>
                    </div>
                  ))}
                </div>

                {/* Smart Summary */}
                {insights.length>0&&(
                  <div className="card" style={{padding:20,borderLeft:`4px solid ${T.green}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                      <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${T.green},#0EA5E9)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>✨</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"'Sora',sans-serif"}}>Resumo Inteligente</div>
                        <div style={{fontSize:11,color:T.muted}}>Insights do mês</div>
                      </div>
                    </div>
                    {insights.map((ins,i)=>(
                      <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 0",borderTop:i>0?`1px solid ${T.border}`:"none"}}>
                        <div style={{width:30,height:30,borderRadius:8,background:ins.type==="positive"?T.greenSft:ins.type==="negative"?T.redSft:T.blueSft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{ins.icon}</div>
                        <div style={{fontSize:13,color:T.text2,lineHeight:1.5,paddingTop:6}}>{ins.text}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Category breakdown */}
                {catBreak.length>0?(
                  <div className="card" style={{padding:20}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"'Sora',sans-serif",marginBottom:16}}>Gastos por Categoria</div>
                    <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
                      <Donut data={catBreak.map(c=>({...c,value:c.value}))} size={140} centerLabel="total"/>
                      <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
                        {catBreak.slice(0,5).map(c=>(
                          <div key={c.id}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <div style={{width:24,height:24,borderRadius:6,background:c.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{c.icon}</div>
                                <span style={{fontSize:12,color:T.text2,fontWeight:500}}>{c.label}</span>
                              </div>
                              <span style={{fontSize:11,color:c.color,fontFamily:"JetBrains Mono,monospace",fontWeight:500}}>{fmt(c.value)}</span>
                            </div>
                            <ProgressBar pct={(c.value/maxCat)*100} color={c.color} height={5}/>
                          </div>
                        ))}
                        {catBreak.length>5&&<div style={{fontSize:11,color:T.muted,paddingTop:2}}>+{catBreak.length-5} categorias</div>}
                      </div>
                    </div>
                  </div>
                ):(
                  <div className="card" style={{padding:40,textAlign:"center"}}>
                    <div style={{fontSize:40,marginBottom:12}}>📊</div>
                    <div style={{color:T.muted,fontSize:14,fontWeight:500}}>Nenhuma despesa em {MONTHS_PT[selMon-1]}</div>
                    <div style={{color:T.dim,fontSize:12,marginTop:4}}>Adicione comprovantes ou clique em + Novo</div>
                  </div>
                )}
              </>
            )}

            {/* ── PF / PJ ── */}
            {subTab==="pfpj"&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[{l:"Vida Pessoal",sub:"Despesas PF",v:pfDespesas,c:"#4F7EF7",bg:"#EEF3FE",ic:"🏠"},{l:"Empresa",sub:"Despesas PJ",v:pjDespesas,c:T.yellow,bg:T.yellowSft,ic:"🏢"}].map(({l,sub,v,c,bg,ic})=>(
                    <div key={l} className="card card-hover" style={{padding:18}}>
                      <div style={{width:34,height:34,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:10}}>{ic}</div>
                      <div style={{fontSize:10,color:T.muted,letterSpacing:0.8,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>{sub}</div>
                      <div style={{fontSize:16,fontWeight:700,color:c,fontFamily:"'Sora',sans-serif"}}>{fmt(v)}</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:1}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"'Sora',sans-serif",marginBottom:14}}>Contas com Divisão PF/PJ</div>
                  {mTxs.filter(t=>t.isPJ&&t.tipo==="despesa").length===0?(
                    <div style={{textAlign:"center",padding:"24px 0"}}>
                      <div style={{fontSize:36,marginBottom:10}}>🏢</div>
                      <div style={{color:T.muted,fontSize:13,fontWeight:500}}>Nenhuma conta PJ neste mês</div>
                      <div style={{color:T.dim,fontSize:12,marginTop:4}}>Ative "Dividir PF/PJ" ao cadastrar</div>
                    </div>
                  ):mTxs.filter(t=>t.isPJ&&t.tipo==="despesa").map((tx,i,arr)=>{
                    const cat=getCat(tx.categoria);
                    return(
                      <div key={tx.id} style={{padding:"14px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <div style={{display:"flex",gap:10,alignItems:"center"}}>
                            <div style={{width:36,height:36,borderRadius:10,background:cat.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{cat.icon}</div>
                            <div>
                              <div style={{fontSize:13,color:T.text,fontWeight:600}}>{tx.descricao}</div>
                              <div style={{fontSize:11,color:T.muted}}>{tx.data?.slice(0,10)}</div>
                            </div>
                          </div>
                          <div style={{fontSize:13,fontWeight:700,fontFamily:"JetBrains Mono,monospace",color:T.text}}>{fmt(tx.valor)}</div>
                        </div>
                        <div style={{height:8,borderRadius:4,overflow:"hidden",background:T.surf2,display:"flex"}}>
                          <div style={{width:`${100-tx.pjPct}%`,background:"#4F7EF7",transition:"width .6s"}}/>
                          <div style={{flex:1,background:T.yellow}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                          <span style={{fontSize:11,color:"#4F7EF7",fontWeight:600}}>🏠 PF {100-tx.pjPct}% · {fmt(tx.pfValor)}</span>
                          <span style={{fontSize:11,color:T.yellow,fontWeight:600}}>🏢 PJ {tx.pjPct}% · {fmt(tx.pjValor)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 50/30/20 ── */}
            {subTab==="metodo"&&(
              <>
                {receitas===0?(
                  <div className="card" style={{padding:40,textAlign:"center"}}>
                    <div style={{fontSize:40,marginBottom:12}}>💡</div>
                    <div style={{color:T.muted,fontSize:14,fontWeight:500}}>Registre uma receita primeiro</div>
                    <div style={{color:T.dim,fontSize:12,marginTop:4}}>O método 50/30/20 compara gastos com sua renda</div>
                  </div>
                ):(
                  <>
                    <div style={{borderRadius:18,padding:16,background:`linear-gradient(135deg,${T.greenSft},${T.blueSft})`,border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:12,color:T.green,fontWeight:700,marginBottom:3,fontFamily:"'Sora',sans-serif"}}>📐 Método 50·30·20</div>
                      <div style={{fontSize:12,color:T.text2,lineHeight:1.6}}>Baseado em <strong>{fmt(receitas)}</strong> de renda em {MONTHS_PT[selMon-1]}</div>
                    </div>
                    {Object.entries(BUCKETS).map(([key,bk])=>{
                      const actual=bucketTotals[key]||0,recommended=receitas*bk.pct/100;
                      const pctUsed=recommended>0?(actual/recommended)*100:0;
                      const pctOfIncome=receitas>0?(actual/receitas)*100:0;
                      const isInv=key==="investimentos";
                      const ok=isInv?actual>=recommended:actual<=recommended;
                      const bad=!ok&&(isInv?pctOfIncome<bk.pct*0.5:pctUsed>110);
                      const sc=ok?T.green:bad?T.red:T.yellow;
                      const tip=ok?bk.tip_ok:(isInv?bk.tip_low:bk.tip_over);
                      return(
                        <div key={key} className="card card-hover" style={{padding:20,borderTop:`3px solid ${sc}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                            <div>
                              <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:"'Sora',sans-serif"}}>{bk.icon} {bk.label}</div>
                              <div style={{fontSize:11,color:T.muted,marginTop:2}}>Ideal: {bk.pct}% → {fmt(recommended)}</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:16,fontWeight:800,color:sc,fontFamily:"'Sora',sans-serif"}}>{fmt(actual)}</div>
                              <div style={{fontSize:11,color:T.muted}}>{pctOfIncome.toFixed(0)}% da renda</div>
                            </div>
                          </div>
                          <ProgressBar pct={pctUsed} color={sc} height={8}/>
                          <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11}}>
                            <span style={{color:T.muted}}>0%</span>
                            <span style={{color:sc,fontWeight:700}}>{pctUsed.toFixed(0)}% do limite</span>
                            <span style={{color:T.muted}}>100%</span>
                          </div>
                          <div style={{marginTop:14,padding:"10px 14px",borderRadius:12,background:ok?T.greenSft:bad?T.redSft:T.yellowSft}}>
                            <div style={{fontSize:12,color:ok?T.green:bad?T.red:T.yellow,lineHeight:1.5,fontWeight:500}}>
                              {ok?"✅":bad?"❌":"⚠️"} {tip}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(()=>{
                      const allOk=Object.entries(BUCKETS).every(([k,b])=>{const a=bucketTotals[k]||0,r=receitas*b.pct/100;return k==="investimentos"?a>=r:a<=r;});
                      return(
                        <div className="card" style={{padding:20,textAlign:"center",borderTop:`3px solid ${allOk?T.green:T.yellow}`}}>
                          <div style={{fontSize:32,marginBottom:8}}>{allOk?"🎯":"📈"}</div>
                          <div style={{fontSize:14,fontWeight:700,color:allOk?T.green:T.text,fontFamily:"'Sora',sans-serif"}}>{allOk?"Parabéns! Você está no método 50/30/20!":"Continue ajustando suas finanças"}</div>
                          <div style={{fontSize:12,color:T.muted,marginTop:6,lineHeight:1.6}}>{allOk?"Seus gastos estão equilibrados este mês.":"Pequenos ajustes fazem uma grande diferença ao longo do tempo."}</div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ UPLOAD ══ */}
        {tab==="upload"&&(
          <div className="fade" style={{display:"flex",flexDirection:"column",gap:14}}>
            <div ref={dropRef} className="card"
              onDrop={(e)=>{e.preventDefault();dropRef.current?.classList.remove("drop-active");handleFiles(e.dataTransfer.files);}}
              onDragOver={(e)=>{e.preventDefault();dropRef.current?.classList.add("drop-active");}}
              onDragLeave={()=>dropRef.current?.classList.remove("drop-active")}
              style={{padding:36,textAlign:"center",border:`2px dashed ${T.border}`,cursor:"pointer",transition:"all .2s",borderRadius:20}}>
              <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
              <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
              {uploading?(
                <>
                  <div style={{width:52,height:52,border:`3px solid ${T.border}`,borderTopColor:T.green,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
                  <div style={{color:T.green,fontSize:15,fontWeight:700,fontFamily:"'Sora',sans-serif"}}>Analisando com IA…</div>
                  <div style={{color:T.muted,fontSize:12,marginTop:4}}>Extraindo valor, data e categoria</div>
                </>
              ):(
                <>
                  <div style={{width:64,height:64,borderRadius:20,background:T.greenSft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 16px"}}>📄</div>
                  <div style={{color:T.text,fontSize:15,fontWeight:700,fontFamily:"'Sora',sans-serif",marginBottom:6}}>Enviar Comprovante</div>
                  <div style={{color:T.muted,fontSize:13,marginBottom:20}}>Arraste aqui ou use os botões abaixo</div>
                  <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                    <button className="btn btn-green" onClick={()=>camRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}>📷 Tirar Foto</button>
                    <button className="btn btn-outline" onClick={()=>fileRef.current?.click()}>📁 Arquivo</button>
                  </div>
                </>
              )}
            </div>
            {uploadErr&&(
              <div style={{borderRadius:16,padding:16,background:T.redSft,border:`1px solid #FECACA`}}>
                <div style={{fontSize:13,color:T.red,fontWeight:500,marginBottom:10}}>⚠️ {uploadErr}</div>
                <button className="btn btn-outline" onClick={()=>openForm({tipo:"despesa",isPJ:false,pjPct:30},"manual")} style={{width:"100%",textAlign:"center"}}>Adicionar manualmente</button>
              </div>
            )}
            <div className="card" style={{padding:18}}>
              <div style={{fontSize:12,color:T.text,fontWeight:700,marginBottom:12,fontFamily:"'Sora',sans-serif"}}>💡 Funciona com</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {["Comprovantes PIX","Notas fiscais","Boletos pagos","Apps de pagamento","Extratos bancários","Faturas cartão"].map(t=>(
                  <div key={t} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.text2}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:T.green,flexShrink:0}}/>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ TRANSACTIONS ══ */}
        {tab==="transactions"&&(
          <div className="fade" style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
              {months.slice(0,8).map(m=>{const[y,mo]=m.split("-");return(
                <button key={m} className="btn" onClick={()=>setMonth(m)}
                  style={{flexShrink:0,padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:600,border:"1.5px solid",transition:"all .2s",
                    borderColor:month===m?T.green:T.border,background:month===m?T.green:"#fff",
                    color:month===m?"#fff":T.muted,boxShadow:month===m?shadow.green:shadow.xs}}>
                  {MONTHS_PT[parseInt(mo)-1].slice(0,3)} {y}
                </button>
              );})}
            </div>
            {/* Summary strip */}
            {mTxs.length>0&&(
              <div style={{display:"flex",gap:8,padding:"10px 14px",borderRadius:14,background:"#fff",boxShadow:shadow.xs,alignItems:"center"}}>
                <span style={{fontSize:12,color:T.muted,flex:1}}>{mTxs.length} lançamentos</span>
                <span style={{fontSize:12,color:T.green,fontWeight:600,fontFamily:"JetBrains Mono,monospace"}}>+{fmt(receitas)}</span>
                <span style={{fontSize:12,color:T.muted,margin:"0 2px"}}>·</span>
                <span style={{fontSize:12,color:T.red,fontWeight:600,fontFamily:"JetBrains Mono,monospace"}}>-{fmt(despesas)}</span>
              </div>
            )}
            {mTxs.length===0?(
              <div className="card" style={{padding:48,textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:12}}>📋</div>
                <div style={{color:T.muted,fontWeight:500}}>Nenhum lançamento em {MONTHS_PT[selMon-1]}</div>
              </div>
            ):(
              <div className="card" style={{overflow:"hidden"}}>
                {[...mTxs].sort((a,b)=>new Date(b.data)-new Date(a.data)).map((tx,i,arr)=>{
                  const cat=getCat(tx.categoria);
                  return(
                    <div key={tx.id} className="tx" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <div style={{width:42,height:42,borderRadius:12,background:cat.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.descricao}</div>
                        <div style={{display:"flex",gap:6,marginTop:3,alignItems:"center"}}>
                          <span style={{fontSize:11,color:T.muted}}>{tx.data?.slice(0,10)}</span>
                          <span style={{fontSize:10,color:cat.color,background:cat.bg,padding:"1px 7px",borderRadius:10,fontWeight:600}}>{cat.label}</span>
                          {tx.isPJ&&<span style={{fontSize:10,color:T.yellow,background:T.yellowSft,padding:"1px 7px",borderRadius:10,fontWeight:600}}>PJ</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                        <div style={{fontFamily:"JetBrains Mono,monospace",fontSize:14,fontWeight:700,color:tx.tipo==="receita"?T.green:T.red}}>
                          {tx.tipo==="receita"?"+":"-"}{fmt(tx.valor)}
                        </div>
                        <button onClick={()=>deleteTx(tx.id)} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:12,lineHeight:1,padding:0,transition:"color .15s"}} onMouseOver={e=>e.currentTarget.style.color=T.red} onMouseOut={e=>e.currentTarget.style.color=T.dim}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ MODAL ══ */}
      {showModal&&form&&(
        <div style={{position:"fixed",inset:0,background:"rgba(11,17,32,0.4)",display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)"}}
          onClick={()=>{setShowModal(false);setForm(null);}}>
          <div className="fade" style={{width:"100%",maxWidth:480,margin:"0 auto",background:"#fff",padding:24,borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.12)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:T.dim,borderRadius:2,margin:"0 auto 22px"}}/>
            <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:20,fontFamily:"'Sora',sans-serif"}}>
              {form._mode==="confirm"?"✓ Confirmar Extração":"Novo Lançamento"}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* Tipo */}
              <div style={{display:"flex",gap:8,background:T.surf2,padding:4,borderRadius:14}}>
                {[["despesa","💸 Despesa"],["receita","💰 Receita"]].map(([v,l])=>(
                  <button key={v} className="btn" onClick={()=>setForm({...form,tipo:v})}
                    style={{flex:1,padding:"10px",borderRadius:10,fontSize:13,fontWeight:700,transition:"all .2s",
                      background:form.tipo===v?"#fff":"transparent",
                      color:form.tipo===v?T.text:T.muted,
                      boxShadow:form.tipo===v?shadow.sm:"none"}}>
                    {l}
                  </button>
                ))}
              </div>
              <input placeholder="Descrição *" value={form.descricao||""} onChange={e=>setForm({...form,descricao:e.target.value})}/>
              <input placeholder="Estabelecimento / Origem" value={form.estabelecimento||""} onChange={e=>setForm({...form,estabelecimento:e.target.value})}/>
              <input type="number" step="0.01" placeholder="Valor em R$ *" value={form.valor||""} onChange={e=>setForm({...form,valor:e.target.value})}/>
              <input type="date" value={form.data||""} onChange={e=>setForm({...form,data:e.target.value})}/>
              <select value={form.categoria||"outros"} onChange={e=>setForm({...form,categoria:e.target.value})}>
                {CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>

              {/* PF/PJ */}
              {form.tipo==="despesa"&&(
                <div style={{padding:16,borderRadius:16,background:T.surf2,border:`1.5px solid ${form.isPJ?T.green:T.border}`,transition:"border-color .2s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:form.isPJ?16:0}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>🏢 Dividir PF / PJ</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:2}}>Ex: escritório em casa</div>
                    </div>
                    <button className="btn" onClick={()=>setForm({...form,isPJ:!form.isPJ})}
                      style={{width:48,height:26,borderRadius:13,border:"none",position:"relative",
                        background:form.isPJ?T.green:T.dim,transition:"background .2s"}}>
                      <div style={{position:"absolute",top:3,left:form.isPJ?24:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
                    </button>
                  </div>
                  {form.isPJ&&(
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:10}}>
                        <span style={{color:"#4F7EF7",fontWeight:700}}>🏠 PF: {100-(form.pjPct||30)}%</span>
                        <span style={{color:T.yellow,fontWeight:700}}>🏢 PJ: {form.pjPct||30}%</span>
                      </div>
                      <input type="range" min="1" max="99" value={form.pjPct||30}
                        onChange={e=>setForm({...form,pjPct:parseInt(e.target.value)})}
                        style={{accentColor:T.green,cursor:"pointer",border:"none",padding:"4px 0",background:"transparent",boxShadow:"none"}}/>
                      {form.valor&&(
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginTop:8,padding:"8px 12px",background:"#fff",borderRadius:10}}>
                          <span style={{color:"#4F7EF7",fontWeight:600}}>PF: {fmt(parseFloat(String(form.valor).replace(",","."))*(100-(form.pjPct||30))/100)}</span>
                          <span style={{color:T.yellow,fontWeight:600}}>PJ: {fmt(parseFloat(String(form.valor).replace(",","."))*((form.pjPct||30))/100)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{display:"flex",gap:10,marginTop:4}}>
                <button className="btn btn-outline" onClick={()=>{setShowModal(false);setForm(null);}} style={{flex:1}}>Cancelar</button>
                <button className="btn btn-green" onClick={saveForm} style={{flex:2}}>Salvar Lançamento</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
