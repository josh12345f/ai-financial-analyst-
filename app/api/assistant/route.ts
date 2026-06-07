import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function env(name:string){ return process.env[name] || ""; }

export async function POST(req: Request){
  const body = await req.json().catch(()=>({}));
  const question = String(body.question || "What matters today?");
  const snapshot = body.snapshot || {};
  const context = JSON.stringify({ news:(snapshot.news||[]).slice(0,12), markets:(snapshot.markets||[]).slice(0,12), risks:snapshot.risks, filings:(snapshot.filings||[]).slice(0,8), regulations:(snapshot.regulations||[]).slice(0,8), insights:snapshot.insights }).slice(0,16000);
  if(env("OPENAI_API_KEY")){
    try{
      const r = await fetch(`${env("OPENAI_BASE_URL") || "https://api.openai.com/v1"}/chat/completions`,{
        method:"POST",
        headers:{"content-type":"application/json","authorization":`Bearer ${env("OPENAI_API_KEY")}`},
        body:JSON.stringify({model:env("OPENAI_SUMMARY_MODEL")||"gpt-4o-mini",messages:[{role:"system",content:"You are an institutional market intelligence analyst. Use only provided live app data. Cite source names and say unavailable when evidence is missing. This is not financial advice."},{role:"user",content:`Question: ${question}\n\nLive app data:\n${context}`}],temperature:.2})
      });
      const j = await r.json();
      const answer = j.choices?.[0]?.message?.content;
      if(answer) return NextResponse.json({answer});
    }catch{}
  }
  const risks = snapshot.risks || {};
  const top = Object.entries(risks).sort((a:any,b:any)=>b[1]-a[1])[0];
  const headlines = (snapshot.news||[]).slice(0,5).map((n:any)=>`- ${n.title} (${n.source})`).join("\n");
  return NextResponse.json({answer:`OpenAI is unavailable or not configured in Vercel, so this is a local source-backed answer.\n\nQuestion: ${question}\n\nTop risk: ${top ? `${top[0]} at ${top[1]}%` : "Unavailable"}.\n\nRecent source headlines:\n${headlines || "No live headlines available."}\n\nSuggested next checks: verify provider keys in Vercel, inspect SEC/Federal Register items, and compare watchlist price moves with live headlines. Not financial advice.`});
}
