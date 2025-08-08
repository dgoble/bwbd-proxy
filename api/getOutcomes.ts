import type { VercelRequest, VercelResponse } from '@vercel/node';
const BASE='https://sportsbook-api2.p.rapidapi.com';
const HOST='sportsbook-api2.p.rapidapi.com';
const KEY=process.env.RAPIDAPI_KEY!;

async function fetchJSON(path:string){
  const r=await fetch(`${BASE}${path}`,{headers:{'x-rapidapi-host':HOST,'x-rapidapi-key':KEY}});
  if(!r.ok) return null;
  return r.json();
}

const sources = [
  'DRAFT_KINGS','DRAFTKINGS','DRAFT KINGS','PINNACLE', // then generic
];

export default async (req: VercelRequest, res: VercelResponse) => {
  try{
    const { marketKey } = req.query as any;
    if(!marketKey) return res.status(400).json({ error:'marketKey required' });

    let j:any=null;
    for (const s of sources){
      j = await fetchJSON(`/v1/markets/${encodeURIComponent(String(marketKey))}/outcomes/latest?source=[\"${s}\"]`);
      if (j && j.market && j.market.outcomes) break;
    }
    if(!j) j = await fetchJSON(`/v1/markets/${encodeURIComponent(String(marketKey))}/outcomes/latest`);
    if(!j || !j.market) j = await fetchJSON(`/v0/markets/${encodeURIComponent(String(marketKey))}/outcomes/latest`);
    if(!j) j = await fetchJSON(`/v0/markets/${encodeURIComponent(String(marketKey))}/outcomes?isLive=false`);

    if(!j || !j.market) return res.status(404).json({ error:'outcomes_not_found' });

    const v1 = j.market?.outcomes;
    const over = v1?.OVER?.[0] || null;
    const under = v1?.UNDER?.[0] || null;

    let line:number|undefined, overOdds:number|undefined, underOdds:number|undefined;

    if(over && under){
      line = over.modifier ?? under.modifier;
      overOdds = over.payout;
      underOdds = under.payout;
    } else if (Array.isArray(j.outcomes)){
      const _over = j.outcomes.find((o:any)=> String(o.type).toUpperCase()==='OVER');
      const _under= j.outcomes.find((o:any)=> String(o.type).toUpperCase()==='UNDER');
      line = _over?.modifier ?? _under?.modifier;
      overOdds = _over?.payout;
      underOdds = _under?.payout;
    }

    if(line===undefined || overOdds===undefined || underOdds===undefined){
      return res.status(422).json({ error:'missing_required_fields', have:{ line, overOdds, underOdds }});
    }

    return res.json({ line, overOdds, underOdds });
  }catch(e:any){ return res.status(500).json({ error:e.message }); }
}
