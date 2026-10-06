import { fileURLToPath } from 'node:url';
import type { DataSource } from 'typeorm';
import fonteDeDados from './data-source.js';

/** Aplica as migrations pendentes; devolve os nomes aplicados. */
export async function migrar(fonte: DataSource): Promise<string[]> {
  // A CLI do TypeORM força log de queries; aqui só erros.
  fonte.setOptions({ logging: ['error'] });
  await fonte.initialize();
  try {
    const aplicadas = await fonte.runMigrations({ transaction: 'all' });
    return aplicadas.map((migration) => migration.name);
  } finally {
    await fonte.destroy();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const nomes = await migrar(fonteDeDados);
    if (nomes.length === 0) console.log('nenhuma migration pendente');
    for (const nome of nomes) console.log(`migration aplicada: ${nome}`);
  } catch (erro) {
    // Só nome e mensagem: nunca imprimir as opções (têm a URL do banco).
    const { name, message } = erro as Error;
    console.error(`${name}: ${message}`);
    process.exitCode = 1;
  }
}
