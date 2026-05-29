import { useState } from "react"
import { supabase } from "./supabase"

const T = {
  bg:"#F0F4F8", surf:"#FFFFFF", surf2:"#F7F9FC",
  border:"#E4EAF2", text:"#0B1120", text2:"#3D4E6B",
  muted:"#8A9BBF", green:"#16C784", greenDk:"#0DA86A",
  greenSft:"#E6F9F2", red:"#F0514F", dim:"#C8D3E8"
}

export default function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login") // login | signup | magic
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    setLoading(true); setError(""); setMessage("")
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } }
        })
        if (error) throw error
        setMessage("Conta criada! Verifique seu e-mail para confirmar.")
      } else if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onLogin(data.user)
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMessage("Link enviado! Verifique seu e-mail.")
      }
    } catch (e) {
      setError(e.message || "Algo deu errado.")
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    })
  }

  return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap');`}</style>

      <div style={{ maxWidth:380, width:"100%" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ width:68, height:68, borderRadius:20, background:`linear-gradient(135deg,${T.green},#0EA5E9)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 14px", boxShadow:"0 8px 32px rgba(22,199,132,0.3)" }}>📊</div>
          <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Sora',sans-serif", letterSpacing:-0.5 }}>
            <span style={{ color:T.text }}>Organiza</span><span style={{ color:T.green }}>Já</span>
          </div>
          <div style={{ fontSize:13, color:T.muted, marginTop:4 }}>Suas finanças, organizadas já.</div>
        </div>

        <div style={{ background:T.surf, borderRadius:24, padding:24, boxShadow:"0 4px 20px rgba(11,17,32,0.08)" }}>
          {/* Tab switcher */}
          <div style={{ display:"flex", background:T.surf2, borderRadius:12, padding:3, marginBottom:20 }}>
            {[["login","Entrar"],["signup","Criar conta"]].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setError(""); setMessage(""); }}
                style={{ flex:1, padding:"8px", borderRadius:9, border:"none", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all .2s",
                  background: mode===m ? "#fff" : "transparent",
                  color: mode===m ? T.text : T.muted,
                  boxShadow: mode===m ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {mode === "signup" && (
              <input placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)}
                style={{ background:T.surf2, border:`1.5px solid ${T.border}`, borderRadius:12, color:T.text, padding:"11px 14px", fontSize:14, fontFamily:"inherit", width:"100%", outline:"none" }}/>
            )}
            <input type="email" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)}
              style={{ background:T.surf2, border:`1.5px solid ${T.border}`, borderRadius:12, color:T.text, padding:"11px 14px", fontSize:14, fontFamily:"inherit", width:"100%", outline:"none" }}/>
            {mode !== "magic" && (
              <input type="password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)}
                style={{ background:T.surf2, border:`1.5px solid ${T.border}`, borderRadius:12, color:T.text, padding:"11px 14px", fontSize:14, fontFamily:"inherit", width:"100%", outline:"none" }}/>
            )}

            {error && <div style={{ fontSize:12, color:T.red, padding:"8px 12px", background:"#FEF0F0", borderRadius:8 }}>⚠️ {error}</div>}
            {message && <div style={{ fontSize:12, color:T.green, padding:"8px 12px", background:T.greenSft, borderRadius:8 }}>✓ {message}</div>}

            <button onClick={handleSubmit} disabled={loading}
              style={{ padding:"13px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${T.green},${T.greenDk})`, color:"#fff", fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, cursor:loading?"default":"pointer", boxShadow:"0 4px 16px rgba(22,199,132,0.3)", opacity:loading?0.7:1 }}>
              {loading ? "Aguarde..." : mode==="signup" ? "Criar minha conta" : mode==="magic" ? "Enviar link" : "Entrar"}
            </button>

            <div style={{ display:"flex", alignItems:"center", gap:10, margin:"2px 0" }}>
              <div style={{ flex:1, height:1, background:T.border }}/><span style={{ fontSize:12, color:T.muted }}>ou</span><div style={{ flex:1, height:1, background:T.border }}/>
            </div>

            <button onClick={handleGoogle}
              style={{ padding:"12px", borderRadius:12, border:`1.5px solid ${T.border}`, background:T.surf, color:T.text, fontFamily:"inherit", fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              🔵 Continuar com Google
            </button>

            {mode === "login" && (
              <button onClick={() => setMode("magic")}
                style={{ background:"none", border:"none", color:T.muted, fontSize:13, cursor:"pointer", fontFamily:"inherit", marginTop:2 }}>
                Entrar sem senha →
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize:11, color:T.muted, textAlign:"center", marginTop:16, lineHeight:1.6 }}>
          Ao continuar você concorda com os Termos de Uso e Política de Privacidade.
        </p>
      </div>
    </div>
  )
}
