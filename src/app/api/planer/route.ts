import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { destination, startDate, endDate, interessen } = await req.json();

    const dauer = startDate && endDate
      ? `vom ${startDate} bis ${endDate}`
      : 'Dauer nicht angegeben';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Erstelle einen detaillierten Reiseplan für: ${destination} (${dauer}).
${interessen ? `Interessen: ${interessen}` : ''}

Antworte NUR mit diesem JSON (kein Markdown, auf Deutsch):
{
  "sehenswuerdigkeiten": [
    {"name": "Name", "beschreibung": "2 Sätze", "tipp": "praktischer Tipp", "dauer": "z.B. 2 Stunden"}
  ],
  "restaurants": [
    {"name": "Name oder Empfehlung", "typ": "z.B. Lokale Küche", "beschreibung": "1-2 Sätze", "preisklasse": "€ / €€ / €€€"}
  ],
  "aktivitaeten": [
    {"name": "Name", "beschreibung": "1-2 Sätze", "typ": "z.B. Outdoor | Kultur | Entspannung"}
  ],
  "packliste": {
    "kleidung": ["Item 1", "Item 2"],
    "dokumente": ["Item 1", "Item 2"],
    "sonstiges": ["Item 1", "Item 2"]
  },
  "geheimtipps": ["Tipp 1", "Tipp 2", "Tipp 3"],
  "beste_reisezeit": "Kurze Info zur besten Reisezeit",
  "währung": "Währung und Zahlungshinweis",
  "sprache": "Wichtige Phrasen oder Sprachhinweis"
}

Gib mind. 5 Sehenswürdigkeiten, 4 Restaurants, 4 Aktivitäten und eine vollständige Packliste zurück.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extrahiere JSON — zuerst aus Code-Blöcken, dann direkt
    let jsonStr = '';
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      jsonStr = codeBlock[1].trim();
    } else {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      jsonStr = text.slice(start, end + 1);
    }

    // Bereinige häufige Probleme
    jsonStr = jsonStr
      .replace(/,\s*}/g, '}')     // trailing commas in objects
      .replace(/,\s*]/g, ']');    // trailing commas in arrays

    return NextResponse.json(JSON.parse(jsonStr));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
