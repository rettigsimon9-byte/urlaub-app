'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, MapPin, Utensils, Zap, Package, Lightbulb, Download } from 'lucide-react';

interface PlanResult {
  sehenswuerdigkeiten: { name: string; beschreibung: string; tipp: string; dauer: string }[];
  restaurants: { name: string; typ: string; beschreibung: string; preisklasse: string }[];
  aktivitaeten: { name: string; beschreibung: string; typ: string }[];
  packliste: { kleidung: string[]; dokumente: string[]; sonstiges: string[] };
  geheimtipps: string[];
  beste_reisezeit: string;
  währung: string;
  sprache: string;
}

export default function PlanerPage() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [interessen, setInteressen] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'sights' | 'food' | 'activities' | 'pack' | 'tips'>('sights');

  const generate = async () => {
    if (!destination.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/planer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, startDate, endDate, interessen }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setActiveTab('sights');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const ml = 14;
      const cw = pw - ml * 2;
      let y = 0;

      const checkPage = (needed = 12) => {
        if (y + needed > ph - 14) {
          doc.addPage();
          y = 16;
        }
      };

      const sectionTitle = (text: string) => {
        checkPage(14);
        y += 3;
        doc.setFillColor(14, 165, 233);
        doc.rect(ml, y, 3, 7, 'F');
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(text, ml + 6, y + 5.5);
        y += 11;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(ml, y, ml + cw, y);
        y += 5;
      };

      const card = (lines: string[][], boxColor: [number, number, number] = [248, 250, 252]) => {
        const lineHeights = lines.map(([, , , h]) => parseFloat(h || '4'));
        const totalH = lineHeights.reduce((a, b) => a + b, 0) + 6;
        checkPage(totalH + 4);
        doc.setFillColor(...boxColor);
        doc.roundedRect(ml, y, cw, totalH, 2, 2, 'F');
        y += 4;
        for (const [text, font, colorStr, lineH] of lines) {
          const [r, g, b] = (colorStr || '60,60,60').split(',').map(Number);
          doc.setFontSize(parseFloat(font || '9'));
          doc.setFont('helvetica', font?.includes('bold') ? 'bold' : 'normal');
          doc.setTextColor(r, g, b);
          const wrapped = doc.splitTextToSize(text, cw - 6);
          doc.text(wrapped, ml + 3, y);
          y += wrapped.length * parseFloat(lineH || '4');
        }
        y += 4;
      };

      // ---- HEADER ----
      doc.setFillColor(14, 165, 233);
      doc.rect(0, 0, pw, 36, 'F');
      doc.setFillColor(7, 89, 133);
      doc.rect(0, 28, pw, 8, 'F');

      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Reiseplan', ml, 13);

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(destination, ml, 24);

      if (startDate || endDate) {
        const dateStr = startDate && endDate ? `${startDate}  bis  ${endDate}` : startDate || endDate;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(186, 230, 253);
        doc.text(dateStr, ml, 32);
      }
      if (interessen) {
        doc.setFontSize(8);
        doc.setTextColor(186, 230, 253);
        doc.text(`Interessen: ${interessen}`, pw - ml - doc.getTextWidth(`Interessen: ${interessen}`), 32);
      }

      y = 44;

      // ---- QUICK INFO ----
      const infoW = (cw - 4) / 3;
      const infos = [
        { label: 'Beste Reisezeit', val: result.beste_reisezeit },
        { label: 'Waehrung', val: result.währung },
        { label: 'Sprache', val: result.sprache },
      ];
      infos.forEach((info, i) => {
        const x = ml + i * (infoW + 2);
        doc.setFillColor(240, 249, 255);
        doc.roundedRect(x, y, infoW, 16, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(14, 165, 233);
        doc.text(info.label.toUpperCase(), x + 3, y + 5);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        const vLines = doc.splitTextToSize(info.val, infoW - 6);
        doc.text(vLines.slice(0, 2), x + 3, y + 10);
      });
      y += 22;

      // ---- SEHENSWUERDIGKEITEN ----
      sectionTitle('Sehenswuerdigkeiten');
      result.sehenswuerdigkeiten.forEach((s, i) => {
        const descWrapped = doc.splitTextToSize(s.beschreibung, cw - 6);
        const tipWrapped = doc.splitTextToSize(`Tipp: ${s.tipp}`, cw - 6);
        const totalH = 5 + descWrapped.length * 4 + tipWrapped.length * 3.5 + 7;
        checkPage(totalH + 4);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(ml, y, cw, totalH, 2, 2, 'F');
        const startY = y;
        y += 5;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`${i + 1}. ${s.name}`, ml + 3, y);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(14, 165, 233);
        const durW = doc.getTextWidth(s.dauer);
        doc.text(s.dauer, ml + cw - durW - 3, y);
        y += 5;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(descWrapped, ml + 3, y);
        y += descWrapped.length * 4 + 2;

        doc.setFillColor(255, 251, 235);
        doc.roundedRect(ml + 2, y - 1, cw - 4, tipWrapped.length * 3.5 + 4, 1, 1, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(180, 120, 20);
        doc.text(tipWrapped, ml + 5, y + 2.5);
        y += tipWrapped.length * 3.5 + 6;
        void startY;
      });

      // ---- RESTAURANTS ----
      sectionTitle('Restaurants & Essen');
      result.restaurants.forEach(r => {
        const descWrapped = doc.splitTextToSize(r.beschreibung, cw - 6);
        const totalH = 5 + descWrapped.length * 4 + 10;
        checkPage(totalH + 4);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(ml, y, cw, totalH, 2, 2, 'F');
        y += 5;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(r.name, ml + 3, y);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 163, 74);
        const pkW = doc.getTextWidth(r.preisklasse);
        doc.text(r.preisklasse, ml + cw - pkW - 3, y);
        y += 5;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(99, 102, 241);
        doc.text(r.typ, ml + 3, y);
        y += 5;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(descWrapped, ml + 3, y);
        y += descWrapped.length * 4 + 4;
      });

      // ---- AKTIVITAETEN ----
      sectionTitle('Aktivitaeten');
      result.aktivitaeten.forEach(a => {
        const descWrapped = doc.splitTextToSize(a.beschreibung, cw - 6);
        const totalH = 5 + descWrapped.length * 4 + 6;
        checkPage(totalH + 4);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(ml, y, cw, totalH, 2, 2, 'F');
        y += 5;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(a.name, ml + 3, y);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(107, 114, 128);
        const typW = doc.getTextWidth(a.typ);
        doc.text(a.typ, ml + cw - typW - 3, y);
        y += 5;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(descWrapped, ml + 3, y);
        y += descWrapped.length * 4 + 4;
      });

      // ---- PACKLISTE ----
      sectionTitle('Packliste');
      const packSections = [
        { title: 'Kleidung', items: result.packliste.kleidung },
        { title: 'Dokumente', items: result.packliste.dokumente },
        { title: 'Sonstiges', items: result.packliste.sonstiges },
      ];
      packSections.forEach(section => {
        checkPage(10 + section.items.length * 6);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(section.title, ml, y);
        y += 5;
        section.items.forEach(item => {
          checkPage(6);
          doc.setDrawColor(200, 210, 220);
          doc.setLineWidth(0.3);
          doc.roundedRect(ml + 1, y - 3, 3.5, 3.5, 0.5, 0.5);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(item, ml + 7, y);
          y += 5;
        });
        y += 3;
      });

      // ---- GEHEIMTIPPS ----
      sectionTitle('Geheimtipps');
      result.geheimtipps.forEach(tip => {
        const tipWrapped = doc.splitTextToSize(tip, cw - 10);
        const boxH = tipWrapped.length * 4 + 6;
        checkPage(boxH + 3);
        doc.setFillColor(255, 251, 235);
        doc.roundedRect(ml, y, cw, boxH, 2, 2, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(217, 119, 6);
        doc.text('*', ml + 3, y + 5);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(tipWrapped, ml + 9, y + 4.5);
        y += boxH + 3;
      });

      // ---- FOOTER ----
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(248, 250, 252);
        doc.rect(0, ph - 10, pw, 10, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(`Seite ${i} / ${pageCount}`, ml, ph - 4);
        doc.text('Erstellt mit Urlaub App', pw - ml - doc.getTextWidth('Erstellt mit Urlaub App'), ph - 4);
      }

      doc.save(`Reiseplan-${destination}.pdf`);
    } catch (e) {
      console.error('PDF export error:', e);
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { id: 'sights', label: 'Sights', icon: MapPin },
    { id: 'food', label: 'Essen', icon: Utensils },
    { id: 'activities', label: 'Aktiv', icon: Zap },
    { id: 'pack', label: 'Packen', icon: Package },
    { id: 'tips', label: 'Tipps', icon: Lightbulb },
  ] as const;

  return (
    <div className="min-h-screen pb-10">
      <div className="sticky top-0 z-10 bg-[#f0f4f8]/95 backdrop-blur-sm pt-12 pb-4 px-5">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Reiseplaner</h1>
          {result && (
            <button
              onClick={exportPDF}
              disabled={exporting}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-sky-500 text-white rounded-xl text-xs font-semibold hover:bg-sky-600 transition-colors disabled:opacity-50"
            >
              {exporting
                ? <><Loader2 size={13} className="animate-spin" /> PDF…</>
                : <><Download size={13} /> PDF</>}
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input
            value={destination}
            onChange={e => setDestination(e.target.value)}
            placeholder="Reiseziel z.B. Barcelona, Japan, Kroatien..."
            className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 font-medium"
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-600" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-600" />
          </div>
          <input
            value={interessen}
            onChange={e => setInteressen(e.target.value)}
            placeholder="Interessen z.B. Strand, Kultur, Essen, Wandern..."
            className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-500"
          />
          <button
            onClick={generate}
            disabled={loading || !destination.trim()}
            className="w-full py-3 bg-sky-500 text-white rounded-xl font-semibold text-sm hover:bg-sky-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> KI plant deinen Urlaub…</> : '🗺️ Reiseplan erstellen'}
          </button>
        </div>
      </div>

      <div className="px-5">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-500 mb-4">⚠️ {error}</div>}

        {result && (
          <div className="animate-slide-up">
            {/* Quick info */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Beste Zeit', value: result.beste_reisezeit },
                { label: 'Währung', value: result.währung },
                { label: 'Sprache', value: result.sprache },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{value}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                    activeTab === id ? 'bg-sky-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>

            {activeTab === 'sights' && (
              <div className="space-y-3">
                {result.sehenswuerdigkeiten.map((s, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-bold text-gray-900">{s.name}</p>
                      <span className="text-xs text-sky-500 bg-sky-50 px-2 py-0.5 rounded-full flex-shrink-0">{s.dauer}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-2">{s.beschreibung}</p>
                    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">💡 {s.tipp}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'food' && (
              <div className="space-y-3">
                {result.restaurants.map((r, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-gray-900">{r.name}</p>
                      <span className="text-sm text-green-600 font-semibold">{r.preisklasse}</span>
                    </div>
                    <p className="text-xs text-indigo-500 font-medium mb-2">{r.typ}</p>
                    <p className="text-sm text-gray-600 leading-relaxed">{r.beschreibung}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'activities' && (
              <div className="space-y-3">
                {result.aktivitaeten.map((a, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-bold text-gray-900 flex-1">{a.name}</p>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a.typ}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{a.beschreibung}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'pack' && (
              <div className="space-y-3">
                {[
                  { title: '👕 Kleidung', items: result.packliste.kleidung },
                  { title: '📄 Dokumente', items: result.packliste.dokumente },
                  { title: '🎒 Sonstiges', items: result.packliste.sonstiges },
                ].map(({ title, items }) => (
                  <div key={title} className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="font-bold text-gray-800 mb-3">{title}</p>
                    <div className="space-y-2">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 border-gray-200 flex-shrink-0" />
                          <p className="text-sm text-gray-600">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'tips' && (
              <div className="space-y-2">
                {result.geheimtipps.map((tip, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
                    <span className="text-lg flex-shrink-0">✨</span>
                    <p className="text-sm text-gray-700 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
