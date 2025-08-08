import type { VercelRequest, VercelResponse } from '@vercel/node';
const BASE='https://sportsbook-api2.p.rapidapi.com';
const HOST='sportsbook-api2.p.rapidapi.com';
const KEY=process.env.RAPIDAPI_KEY!;

async function fetchJSON(path:string){
  const r=await fetch(`${BASE}${path}`,{headers:{'x-rapidapi-host':HOST,'x-rapidapi-key':KEY}});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default async (req: VercelRequest, res: VercelResponse) => {
  try{
    const { eventKey, segment='FULL_MATCH', wantTypes, participantName } = req.query as any;
    if(!eventKey) return res.status(400).json({ error:'eventKey required' });
    const want = wantTypes ? String(wantTypes).split(',') : []; // e.g. TOTAL_RUNS,TOTAL,GAME_TOTAL

    const data = await fetchJSON(`/v0/events/${encodeURIComponent(String(eventKey))}/markets`);
    const markets = data?.markets || data || [];

    const lower=(s:string)=> (s||'').toLowerCase();
    const isCandidate=(m:any)=>{
      if (m.segment!==segment) return false;
      if (participantName) {
        const pn = lower(participantName);
        const cand = lower(m.participant?.name||'');
        if (!cand || !cand.includes(pn)) return false;
      } else {
        if (m.participantKey) return false; // exclude team/player totals if we want full-game
      }
      const t = String(m.type||'');
      if (want.length && (want.includes(t) || want.some(w=>t.includes(w)))) return true;
      if (!want.length && t) return true;
      return false;
    };

    const filtered = markets.filter(isCandidate)
      .filter((m:any)=> !m.subType || String(m.subType).toUpperCase()==='MAIN')
      .sort((a:any,b:any)=> String(b.lastFoundAt).localeCompare(String(a.lastFoundAt)));

    const picked = filtered[0];
    if(!picked) return res.status(404).json({ error:'market_not_found', tried: want });

    return res.json({ marketKey: picked.key, type: picked.type, segment: picked.segment, participant: picked.participant?.name||null });
  }catch(e:any){ return res.status(500).json({ error:e.message }); }
}
