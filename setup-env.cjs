#!/usr/bin/env node
/**
 * Genera i valori da incollare nelle Environment Variables di Vercel.
 * NON committare l'output. NON committare questo file compilato con i PIN dentro.
 *
 * Uso:
 *   node setup-env.cjs
 * poi inserisci i PIN quando richiesto.
 */

const readline = require('readline');
const crypto = require('crypto');

const TEAMS = [
  'Pandamonio',
  'Minturno Scauri',
  'Bestie Di Satana',
  'Spaccio Uno',
  'Diavolone Luis',
  'Dr.Gonzo Social Club',
  'S. Masterella',
  'Atletico Califfo',
  'Real Spillo',
  'Chivas Tramuort',
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

(async () => {
  const pins = {};
  console.log('Inserisci il PIN a 4 cifre per ogni squadra.\n');

  for (const t of TEAMS) {
    let pin = '';
    while (!/^\d{4}$/.test(pin)) {
      pin = (await ask(`  ${t.padEnd(24)} → `)).trim();
      if (!/^\d{4}$/.test(pin)) console.log('    ⚠️  servono esattamente 4 cifre');
    }
    pins[t] = pin;
  }
  rl.close();

  console.log('\n' + '='.repeat(70));
  console.log('Incolla questi valori su Vercel → Settings → Environment Variables');
  console.log('='.repeat(70) + '\n');
  console.log('Nome:   TEAM_PINS');
  console.log('Valore: ' + JSON.stringify(pins) + '\n');
  console.log('Nome:   SESSION_SECRET');
  console.log('Valore: ' + crypto.randomBytes(32).toString('hex') + '\n');
  console.log('='.repeat(70));
  console.log('Marca entrambe come "Sensitive". Poi rifai il deploy.');
})();
