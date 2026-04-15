import { useState, useEffect, useCallback } from "react";

const API_BASE = "https://your-backend.railway.app"; // Change this after deploying backend
const ADMIN_PIN = "1234"; // Change in backend .env

const COLORS = ["#7F77DD","#1D9E75","#D85A30","#378ADD","#D4537E","#BA7517"];
const COLORS_LIGHT = ["#EEEDFE","#E1F5EE","#FAECE7","#E6F1FB","#FBEAF0","#FAEEDA"];

function fmt(n) {
  return Number(n).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function Avatar({ name, color, light, size = 48 }) {
  const initials = name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: light, color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: size * 0.33, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function ProgressBar({ value, max, color, light }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: light, borderRadius: 999, height: 20, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, transition: "width 0.5s ease" }}>
        {pct > 12 && <span style={{ fontSize: 11, color: "#fff", fontWeight: 500 }}>{Math.round(pct)}%</span>}
      </div>
    </div>
  );
}

function MiniChart({ data, color }) {
  if (!data || data.length < 2) return null;
  const W = 300, H = 80;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (W - 20) + 10;
    const y = H - 10 - ((d.value - min) / range) * (H - 20);
    return `${x},${y}`;
  }).join(" ");
  const last = pts.split(" ").pop().split(",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} />
    </svg>
  );
}

function Toast({ msg }) {
  return msg ? (
    <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#1D9E75", color: "#fff", borderRadius: 999, padding: "10px 22px", fontSize: 14, fontWeight: 500, zIndex: 999, whiteSpace: "nowrap" }}>{msg}</div>
  ) : null;
}

function calcProjection(balance, allowance, annualRate, months) {
  const mr = annualRate / 100 / 12;
  let b = parseFloat(balance);
  const pts = [{ month: 0, value: Math.round(b) }];
  for (let i = 1; i <= months; i++) {
    b = b * (1 + mr) + parseFloat(allowance);
    pts.push({ month: i, value: Math.round(b) });
  }
  return pts;
}

// ── Mock API (replace with real fetch calls after deploying backend) ──────────
let mockDB = {
  kids: [
    { id: 1, name: "Emma", allowance: 200, rate: 5, balance: 850, goal_name: "Sykkel", goal_amount: 2000, transactions: [
      { id: 1, date: "2025-03-01", description: "Månedlig lommelomme", amount: 200 },
      { id: 2, date: "2025-03-01", description: "Renter (5% p.a.)", amount: 3.33 },
      { id: 3, date: "2025-02-01", description: "Månedlig lommelomme", amount: 200 },
    ]},
    { id: 2, name: "Oliver", allowance: 150, rate: 5, balance: 430, goal_name: "Lego", goal_amount: 600, transactions: [
      { id: 4, date: "2025-03-01", description: "Månedlig lommelomme", amount: 150 },
      { id: 5, date: "2025-02-01", description: "Månedlig lommelomme", amount: 150 },
    ]},
  ]
};

const api = {
  async getKids() { return mockDB.kids; },
  async getKid(id) { return mockDB.kids.find(k => k.id === id); },
  async addKid(data) {
    const kid = { id: Date.now(), ...data, balance: 0, goal_name: null, goal_amount: null, transactions: [] };
    mockDB.kids.push(kid);
    return kid;
  },
  async deleteKid(id) { mockDB.kids = mockDB.kids.filter(k => k.id !== id); },
  async updateKid(id, data) {
    const idx = mockDB.kids.findIndex(k => k.id === id);
    mockDB.kids[idx] = { ...mockDB.kids[idx], ...data };
    return mockDB.kids[idx];
  },
  async addBonus(id, amount, desc) {
    const idx = mockDB.kids.findIndex(k => k.id === id);
    const tx = { id: Date.now(), date: new Date().toISOString().slice(0,10), description: desc || "Bonus fra foreldre", amount };
    mockDB.kids[idx].balance = Math.round((parseFloat(mockDB.kids[idx].balance) + amount) * 100) / 100;
    mockDB.kids[idx].transactions = [tx, ...mockDB.kids[idx].transactions];
    return mockDB.kids[idx];
  },
  async setGoal(id, name, amount) {
    const idx = mockDB.kids.findIndex(k => k.id === id);
    mockDB.kids[idx] = { ...mockDB.kids[idx], goal_name: name, goal_amount: amount };
    return mockDB.kids[idx];
  },
  async verifyPin(pin) { return pin === ADMIN_PIN; },
};

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  const [kids, setKids] = useState([]);
  const [selKid, setSelKid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const [pinVal, setPinVal] = useState("");
  const [pinErr, setPinErr] = useState(false);
  const [projMonths, setProjMonths] = useState(12);
  const [editGoal, setEditGoal] = useState(false);
  const [goalForm, setGoalForm] = useState({ name: "", amount: "" });
  const [bonusAmt, setBonusAmt] = useState("");
  const [bonusDesc, setBonusDesc] = useState("");
  const [addKidForm, setAddKidForm] = useState({ name: "", allowance: "", rate: "" });
  const [showAddKid, setShowAddKid] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const loadKids = useCallback(async () => {
    setLoading(true);
    const data = await api.getKids();
    setKids(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadKids(); }, []);

  const refreshKid = async (id) => {
    const k = await api.getKid(id);
    setSelKid(k);
    setKids(prev => prev.map(p => p.id === k.id ? k : p));
  };

  const kidColor = selKid ? COLORS[kids.findIndex(k => k.id === selKid.id) % COLORS.length] : "#7F77DD";
  const kidLight = selKid ? COLORS_LIGHT[kids.findIndex(k => k.id === selKid.id) % COLORS_LIGHT.length] : "#EEEDFE";

  // HOME
  if (view === "home") return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <Toast msg={toast} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 500, color: "var(--color-text-primary)" }}>KidsBank</div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Velg din konto</div>
        </div>
        <button onClick={() => setView("adminPin")} style={{ fontSize: 13, padding: "7px 16px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>Foreldre</button>
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-secondary)" }}>Laster...</div> :
        kids.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-secondary)" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🏦</div>
            <div style={{ fontSize: 16 }}>Ingen kontoer ennå.</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Logg inn som forelder for å legge til barn.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {kids.map((k, i) => (
              <div key={k.id} onClick={() => { setSelKid(k); setView("kid"); }} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={k.name} color={COLORS[i%COLORS.length]} light={COLORS_LIGHT[i%COLORS_LIGHT.length]} size={54} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 16, color: "var(--color-text-primary)" }}>{k.name}</div>
                  <div style={{ fontSize: 26, fontWeight: 500, color: COLORS[i%COLORS.length] }}>{fmt(k.balance)}</div>
                  {k.goal_name && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Sparemål: {k.goal_name} – {Math.min(100,Math.round(k.balance/k.goal_amount*100))}%</div>}
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 22 }}>›</div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );

  // ADMIN PIN
  if (view === "adminPin") return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 360, margin: "0 auto", padding: 24 }}>
      <button onClick={() => setView("home")} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 24, padding: 0 }}>← Tilbake</button>
      <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 6, color: "var(--color-text-primary)" }}>Foreldreinnlogging</div>
      <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 20 }}>Skriv inn PIN-kode</div>
      <input type="password" value={pinVal} onChange={e => setPinVal(e.target.value)} onKeyDown={async e => {
        if (e.key !== "Enter") return;
        const ok = await api.verifyPin(pinVal);
        if (ok) { setAdminAuth(true); setPinVal(""); setPinErr(false); setView("admin"); }
        else { setPinErr(true); setPinVal(""); }
      }} placeholder="PIN" style={{ width: "100%", padding: "10px 12px", fontSize: 20, borderRadius: "var(--border-radius-md)", border: `1px solid ${pinErr?"#E24B4A":"var(--color-border-secondary)"}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)", letterSpacing: 10, marginBottom: 8, boxSizing: "border-box" }} />
      {pinErr && <div style={{ color: "#E24B4A", fontSize: 13, marginBottom: 8 }}>Feil PIN-kode</div>}
      <button onClick={async () => {
        const ok = await api.verifyPin(pinVal);
        if (ok) { setAdminAuth(true); setPinVal(""); setPinErr(false); setView("admin"); }
        else { setPinErr(true); setPinVal(""); }
      }} style={{ width: "100%", padding: 10, borderRadius: "var(--border-radius-md)", background: "#7F77DD", color: "#fff", border: "none", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>Logg inn</button>
    </div>
  );

  // ADMIN
  if (view === "admin") return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <Toast msg={toast} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)" }}>Foreldrepanel</div>
        <button onClick={() => { setAdminAuth(false); setView("home"); }} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Logg ut</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {kids.map((k, i) => (
          <div key={k.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <Avatar name={k.name} color={COLORS[i%COLORS.length]} light={COLORS_LIGHT[i%COLORS_LIGHT.length]} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{k.name}</div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{fmt(k.balance)} saldo</div>
              </div>
              <button onClick={async () => { await api.deleteKid(k.id); await loadKids(); showToast(`${k.name}s konto slettet`); }} style={{ fontSize: 12, color: "#E24B4A", background: "none", border: "none", cursor: "pointer" }}>Slett</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[["allowance","Lommelomme (kr/mnd)"],["rate","Rente (% per år)"]].map(([field, label]) => (
                <div key={field}>
                  <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
                  <input type="number" defaultValue={k[field]} onBlur={async e => {
                    await api.updateKid(k.id, { [field]: parseFloat(e.target.value) });
                    await loadKids();
                    showToast("Lagret");
                  }} style={{ width: "100%", padding: "7px 8px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input type="number" placeholder="Beløp (kr)" value={bonusAmt} onChange={e => setBonusAmt(e.target.value)} style={{ flex: 1, padding: "7px 8px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14 }} />
              <input placeholder="Beskrivelse (valgfri)" value={bonusDesc} onChange={e => setBonusDesc(e.target.value)} style={{ flex: 2, padding: "7px 8px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14 }} />
              <button onClick={async () => {
                if (!bonusAmt) return;
                await api.addBonus(k.id, parseFloat(bonusAmt), bonusDesc);
                await loadKids(); setBonusAmt(""); setBonusDesc("");
                showToast(`${fmt(parseFloat(bonusAmt))} lagt til for ${k.name}!`);
              }} style={{ padding: "7px 14px", borderRadius: "var(--border-radius-md)", background: COLORS[i%COLORS.length], color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>+ Legg til</button>
            </div>
          </div>
        ))}
      </div>

      {showAddKid ? (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 12, color: "var(--color-text-primary)" }}>Legg til barn</div>
          <input placeholder="Navn" value={addKidForm.name} onChange={e => setAddKidForm({...addKidForm, name: e.target.value})} style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, marginBottom: 8, boxSizing: "border-box" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input type="number" placeholder="Lommelomme kr/mnd" value={addKidForm.allowance} onChange={e => setAddKidForm({...addKidForm, allowance: e.target.value})} style={{ padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14 }} />
            <input type="number" placeholder="Rente % p.a." value={addKidForm.rate} onChange={e => setAddKidForm({...addKidForm, rate: e.target.value})} style={{ padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={async () => {
              if (!addKidForm.name || !addKidForm.allowance || !addKidForm.rate) return;
              await api.addKid({ name: addKidForm.name, allowance: parseFloat(addKidForm.allowance), rate: parseFloat(addKidForm.rate) });
              await loadKids(); setShowAddKid(false); setAddKidForm({ name: "", allowance: "", rate: "" });
              showToast(`${addKidForm.name} er lagt til!`);
            }} style={{ flex: 1, padding: 9, borderRadius: "var(--border-radius-md)", background: "#7F77DD", color: "#fff", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Legg til</button>
            <button onClick={() => setShowAddKid(false)} style={{ padding: "9px 16px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "none", fontSize: 14, cursor: "pointer", color: "var(--color-text-secondary)" }}>Avbryt</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddKid(true)} style={{ width: "100%", padding: 13, borderRadius: "var(--border-radius-lg)", border: "1.5px dashed var(--color-border-secondary)", background: "none", fontSize: 14, cursor: "pointer", color: "var(--color-text-secondary)" }}>+ Legg til barn</button>
      )}
    </div>
  );

  // KID DASHBOARD
  if (view === "kid" && selKid) {
    const proj = calcProjection(selKid.balance, selKid.allowance, selKid.rate, projMonths);
    const futureVal = proj[proj.length - 1]?.value || 0;
    const goalPct = selKid.goal_amount ? Math.min(100, Math.round(selKid.balance / selKid.goal_amount * 100)) : null;
    const monthsToGoal = selKid.goal_amount && selKid.balance < selKid.goal_amount
      ? proj.findIndex(p => p.value >= selKid.goal_amount)
      : 0;

    return (
      <div style={{ fontFamily: "var(--font-sans)", maxWidth: 480, margin: "0 auto", padding: 16 }}>
        <Toast msg={toast} />
        <button onClick={() => { setView("home"); setSelKid(null); setEditGoal(false); }} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16 }}>← Tilbake</button>

        {/* Hero */}
        <div style={{ background: kidLight, borderRadius: "var(--border-radius-lg)", padding: "24px 16px", marginBottom: 12, textAlign: "center" }}>
          <Avatar name={selKid.name} color={kidColor} light={"rgba(255,255,255,0.6)"} size={64} />
          <div style={{ marginTop: 12, fontSize: 17, fontWeight: 500, color: kidColor }}>{selKid.name}s sparekonto</div>
          <div style={{ fontSize: 42, fontWeight: 500, color: kidColor, margin: "6px 0 2px" }}>{fmt(selKid.balance)}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 999, padding: "5px 14px", fontSize: 13, color: kidColor, fontWeight: 500 }}>
              {fmt(selKid.allowance)} / mnd
            </div>
            <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 999, padding: "5px 14px", fontSize: 13, color: kidColor, fontWeight: 500 }}>
              {selKid.rate}% rente p.a.
            </div>
          </div>
        </div>

        {/* Goal */}
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: "var(--color-text-primary)" }}>Sparemål</div>
            <button onClick={() => { setEditGoal(!editGoal); if (selKid.goal_name) setGoalForm({ name: selKid.goal_name, amount: selKid.goal_amount }); }} style={{ fontSize: 12, color: kidColor, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
              {editGoal ? "Avbryt" : selKid.goal_name ? "Endre" : "+ Sett mål"}
            </button>
          </div>
          {editGoal ? (
            <div>
              <input placeholder="Hva sparer du til?" value={goalForm.name} onChange={e => setGoalForm({...goalForm, name: e.target.value})} style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, marginBottom: 8, boxSizing: "border-box" }} />
              <input type="number" placeholder="Beløp (kr)" value={goalForm.amount} onChange={e => setGoalForm({...goalForm, amount: e.target.value})} style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, marginBottom: 10, boxSizing: "border-box" }} />
              <button onClick={async () => {
                if (!goalForm.name || !goalForm.amount) return;
                await api.setGoal(selKid.id, goalForm.name, parseFloat(goalForm.amount));
                await refreshKid(selKid.id);
                setEditGoal(false); showToast("Sparemål lagret!");
              }} style={{ width: "100%", padding: 9, borderRadius: "var(--border-radius-md)", background: kidColor, color: "#fff", border: "none", fontSize: 14, cursor: "pointer", fontWeight: 500 }}>Lagre mål</button>
            </div>
          ) : selKid.goal_name ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{selKid.goal_name}</span>
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{fmt(selKid.balance)} / {fmt(selKid.goal_amount)}</span>
              </div>
              <ProgressBar value={selKid.balance} max={selKid.goal_amount} color={kidColor} light={kidLight} />
              {monthsToGoal > 0 && (
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>
                  Du når målet om ca. {monthsToGoal} {monthsToGoal === 1 ? "måned" : "måneder"} hvis du sparer løpende
                </div>
              )}
              {selKid.balance >= selKid.goal_amount && (
                <div style={{ fontSize: 13, color: "#1D9E75", fontWeight: 500, marginTop: 6 }}>Gratulerer! Du har nådd sparemålet ditt!</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Du har ikke satt et sparemål ennå.</div>
          )}
        </div>

        {/* Projection */}
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: "var(--color-text-primary)" }}>Fremtidsprognose</div>
            <select value={projMonths} onChange={e => setProjMonths(parseInt(e.target.value))} style={{ fontSize: 12, padding: "4px 8px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <option value={6}>6 måneder</option>
              <option value={12}>12 måneder</option>
              <option value={24}>24 måneder</option>
              <option value={36}>36 måneder</option>
            </select>
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Om {projMonths} måneder har du ca.</div>
          <div style={{ fontSize: 30, fontWeight: 500, color: kidColor, marginBottom: 8 }}>{fmt(futureVal)}</div>
          <MiniChart data={proj} color={kidColor} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            <span>Nå</span><span>{projMonths} mnd</span>
          </div>
        </div>

        {/* Transactions */}
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: 16 }}>
          <div style={{ fontWeight: 500, fontSize: 15, color: "var(--color-text-primary)", marginBottom: 12 }}>Transaksjoner</div>
          {(!selKid.transactions || selKid.transactions.length === 0) ? (
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Ingen transaksjoner ennå.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {selKid.transactions.slice(0, 12).map((tx, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < Math.min(selKid.transactions.length, 12) - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                  <div>
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{tx.description}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{tx.date?.slice(0,10)}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "#1D9E75" }}>+{fmt(tx.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
