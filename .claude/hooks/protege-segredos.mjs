#!/usr/bin/env node
// PreToolUse (Bash): impede que qualquer agente leia arquivos .env pelo shell.
// As regras "deny" do settings.json cobrem a ferramenta Read; este hook cobre
// cat/grep/source/cp etc. Saída com código 2 bloqueia o comando.
import { readFileSync } from 'node:fs';

let entrada;
try {
  entrada = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const comando = String(entrada?.tool_input?.command ?? '');

// .env, .env.local, .env.production... mas não .env.example
const referenciaEnv = /(^|[\s'"=/<>|;&(])\.env(?!\.example\b)(\.[\w-]+)?(?=$|[\s'"|;&)<>])/;

if (referenciaEnv.test(comando)) {
  process.stderr.write(
    'Bloqueado: comandos que acessam arquivos .env não são permitidos (SECURITY.md 3.1). ' +
      'Use .env.example ou src/config/env.schema.ts para saber quais variáveis existem.\n',
  );
  process.exit(2);
}

process.exit(0);
