import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json();
    const imageData = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageData },
          },
          {
            type: 'text',
            text: `Analysiere dieses Foto. Erkenne ob ein Ort, Gebäude, Sehenswürdigkeit, Landschaft oder Reiseziel zu sehen ist.

Antworte NUR mit diesem JSON (kein Markdown, auf Deutsch):
{
  "gefunden": true,
  "name": "Name des Ortes oder der Sehenswürdigkeit",
  "typ": "z.B. Strand | Stadtplatz | Museum | Kirche | Schloss | Berglandschaft | Restaurant | Hotel | Park",
  "ort": "Stadt, Land",
  "beschreibung": "2-3 interessante Sätze über diesen Ort",
  "fakten": ["Fakt 1", "Fakt 2", "Fakt 3"]
}

Falls kein erkennbarer Ort/keine Sehenswürdigkeit:
{"gefunden":false,"name":"","typ":"","ort":"","beschreibung":"","fakten":[]}`,
          },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON');
    return NextResponse.json(JSON.parse(match[0]));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
