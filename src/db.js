// ─── Camada de dados: Supabase ────────────────────────────────────────────────
import { supabase } from './supabase.js'

export async function loadTransactions(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('data', { ascending: false })
  if (error) throw error
  // Normaliza campos para o formato do app
  return data.map(t => ({
    id:             t.id,
    tipo:           t.tipo,
    valor:          parseFloat(t.valor),
    descricao:      t.descricao,
    estabelecimento:t.estabelecimento,
    categoria:      t.categoria,
    data:           t.data,
    isPJ:           t.is_pj,
    pjPct:          t.pj_pct,
    pjValor:        parseFloat(t.pj_valor || 0),
    pfValor:        parseFloat(t.pf_valor || t.valor),
    createdAt:      t.created_at,
  }))
}

export async function saveTransaction(userId, tx) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id:        userId,
      tipo:           tx.tipo,
      valor:          tx.valor,
      descricao:      tx.descricao,
      estabelecimento:tx.estabelecimento || null,
      categoria:      tx.categoria,
      data:           tx.data,
      is_pj:          tx.isPJ || false,
      pj_pct:         tx.pjPct || 0,
      pj_valor:       tx.pjValor || 0,
      pf_valor:       tx.pfValor || tx.valor,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTransaction(id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}
