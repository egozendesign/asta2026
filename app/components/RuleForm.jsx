'use client';

import { useState } from 'react';
import AnimatedSection from './AnimatedSection';
import { useAsta } from './AstaProvider';

/* Form di inserimento di una proposta di regolamento. I campi sono gli stessi
   pezzi di cui è fatta la proposta n.1: titolo, spiegazione e una nota in
   evidenza (facoltativa, tipo la deroga sulle 3 squadre). */

const MAX_TITLE = 90;
const MAX_TEXT = 700;
const MAX_NOTE = 300;

export default function RuleForm() {
  const { me, addRule, notify } = useAsta();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = title.trim().length >= 3 && text.trim().length >= 10;

  const submit = async (e) => {
    e.preventDefault();
    if (!me) { notify('Inserisci il PIN per proporre una modifica', 'err'); return; }
    if (!ready || busy) return;
    setBusy(true);
    const ok = await addRule(title.trim(), text.trim(), note.trim());
    setBusy(false);
    if (ok) { setTitle(''); setText(''); setNote(''); }
  };

  return (
    <AnimatedSection>
      <h2><span className="num alt">+</span>Proponi una modifica</h2>
      <form className="proposal" onSubmit={submit}>
        <div className="ptitle">
          {me ? <>Proposta di {me}</> : 'Serve il PIN per proporre'}
        </div>

        <label className="flabel" htmlFor="rule-title">Titolo della proposta</label>
        <input
          id="rule-title"
          value={title}
          maxLength={MAX_TITLE}
          disabled={!me}
          placeholder="es. Riapertura mercato in sosta nazionali"
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="flabel" htmlFor="rule-text">Cosa cambia e perché</label>
        <textarea
          id="rule-text"
          value={text}
          maxLength={MAX_TEXT}
          disabled={!me}
          style={{ minHeight: 110 }}
          placeholder="Spiega la situazione attuale, cosa proponi di cambiare e che effetto ha sulla stagione."
          onChange={(e) => setText(e.target.value)}
        />

        <label className="flabel" htmlFor="rule-note">
          Nota in evidenza <span className="opt-tag">facoltativa</span>
        </label>
        <textarea
          id="rule-note"
          value={note}
          maxLength={MAX_NOTE}
          disabled={!me}
          placeholder="Una deroga, un limite, una condizione: il punto che deve saltare all’occhio."
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="prow">
          <button type="submit" className="btn" disabled={!me || !ready || busy}>
            {busy ? 'Invio…' : 'Invia proposta'}
          </button>
          <span className="pcount">{text.length}/{MAX_TEXT}</span>
        </div>
        {!me && (
          <div className="hint" style={{ marginTop: 6 }}>
            Puoi leggere e seguire tutte le proposte senza PIN. Per proporre e votare serve il PIN.
          </div>
        )}
      </form>
    </AnimatedSection>
  );
}
