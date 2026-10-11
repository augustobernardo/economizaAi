interface ItemDeRegistro {
  id: string;
  registroId: string;
  criadoEm: Date;
}

/** Base dos fakes de gasto, entrada e parcelamento: o que o `RegistroRepository` precisa. */
export class ColecaoEmMemoria<T extends ItemDeRegistro> {
  protected itens: T[] = [];

  async salvarVarios(novos: T[]): Promise<void> {
    this.itens.push(...novos);
  }

  async removerDoRegistro(
    registroId: string,
    criadoDesde: Date,
  ): Promise<number> {
    const antes = this.itens.length;
    this.itens = this.itens.filter(
      (i) => !(i.registroId === registroId && i.criadoEm >= criadoDesde),
    );
    return antes - this.itens.length;
  }

  async doRegistro(registroId: string): Promise<T[]> {
    // Mesma ordem do banco: criadoEm, depois id.
    return this.itens
      .filter((i) => i.registroId === registroId)
      .sort(
        (a, b) =>
          a.criadoEm.getTime() - b.criadoEm.getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
  }

  async atualizar(item: T): Promise<void> {
    this.itens = this.itens.map((i) => (i.id === item.id ? item : i));
  }

  async removerPorId(id: string): Promise<boolean> {
    const antes = this.itens.length;
    this.itens = this.itens.filter((i) => i.id !== id);
    return antes !== this.itens.length;
  }

  tem(id: string): boolean {
    return this.itens.some((i) => i.id === id);
  }

  limpar(): void {
    this.itens = [];
  }
}
