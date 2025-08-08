import type { VercelRequest, VercelResponse } from '@vercel/node';
const BASE = 'https://sportsbook-api2.p.rapidapi.com';
const HOST = 'sportsbook-api2.p.rapidapi.com';
const KEY = process.env.RAPIDAPI_KEY!;

const tzOffset = (d: Date) => {
  // America/Indiana/Indianapolis offset for the date
  const z = new Intl.DateTimeFormat('en-US',{timeZone:'America/Indiana/Indianapolis', timeZoneName:'shortOffset'}).formatToParts(d)
    .find(p=>p.type==='timeZoneName')?.value || '-04:00';
  return z.replace('GMT','');
};
const iso = (d: Date, h: number, m=0,s=0) =>
  new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),h,m,s)).toISOString().replace('Z','');

async function fetchJSON(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': KEY }});
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    const { league, when = 'today', home, away, player } = req.query as any;
    if (!league) return res.status(400).json({ error: 'league required' });

    const now = new Date();
    const off = tzOffset(now); // e.g., -04:00
    const base = new Date(); // local date for Indy
    const dayISO = base.toISOString().slice(0,10);
    const night = when==='tonight';

    const windows = night
      ? [[12,0,23,59],[15,0,21,0],[18,0,23,59]]
      : [[0,0,23,59],[0,0,12,0],[12,0,23,59]];

    const tryWindow = async ([sH,sM,eH,eM]: number[]) => {
      const start = `${dayISO}T${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')}:00${off}`;
      const end   = `${dayISO}T${String(eH).padStart(2,'0')}:${String(eM).padStart(2,'0')}:59${off}`;
      const data = await fetchJSON(`/v1/competitions/${league}/events?startTimeFrom=${encodeURIComponent(start)}&startTimeTo=${encodeURIComponent(end)}`);
      return { data, start, end };
    };

    let picked: any = null, used: any = null;
    for (const w of windows) {
      const r = await tryWindow(w);
      used = r;
      const events = r.data?.events || r.data || [];
      // fuzzy match: team names/slugs, or player’s team if provided
      const lower = (x:string)=> (x||'').toLowerCase();
      const matchTeam = (ev:any) => {
        const names = ev.participants?.map((p:any)=>[p.name,p.shortName,p.slug]).flat().map(lower) || [];
        const wantsHome = home ? names.some(n=>n.includes(lower(home))) : true;
        const wantsAway = away ? names.some(n=>n.includes(lower(away))) : true;
        return wantsHome && wantsAway;
      };
      picked = events.find(matchTeam);
      if (picked) break;
    }

    if (!picked) return res.status(404).json({ error:'event_not_found', window: used });

    return res.json({
      eventKey: picked.key,
      startTime: picked.startTime,
      participants: picked.participants?.map((p:any)=>({ key:p.key, name:p.name, shortName:p.shortName, slug:p.slug }))
    });
  } catch (e:any) { return res.status(500).json({ error: e.message }); }
}
